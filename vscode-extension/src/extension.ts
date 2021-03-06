/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

 'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as util from './common';
import { MsilDecompilerServer } from './msildecompiler/server';
import { DecompiledTreeProvider, MemberNode } from './msildecompiler/decompiledTreeProvider';

let textEditor: vscode.TextEditor = null;

export function activate(context: vscode.ExtensionContext) {

    const extensionId = 'icsharpcode.ilspy-vscode';
    const extension = vscode.extensions.getExtension(extensionId);

    util.setExtensionPath(extension.extensionPath);

    const server = new MsilDecompilerServer();
    let decompileTreeProvider = new DecompiledTreeProvider(server);
    const disposables: vscode.Disposable[] = [];

    console.log('Congratulations, your extension "ilspy-vscode" is now active!');

    decompileTreeProvider = new DecompiledTreeProvider(server);
    disposables.push(vscode.window.registerTreeDataProvider("ilspyDecompiledMembers", decompileTreeProvider));

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    disposables.push(vscode.commands.registerCommand('ilspy.decompileAssemblyInWorkspace', () => {
        // The code you place here will be executed every time your command is executed
        pickAssembly().then(assembly => {
            decompileFile(assembly);
        });
    }));

    disposables.push(vscode.commands.registerCommand('ilspy.decompileAssemblyPromptForFilePath', () => {
        promptForAssemblyFilePath().then(filePath => {
            let escaped: string = filePath.replace(/\\/g, "\\\\",);
            // Remove surronding double quotes in path copied from Windows Explorer
            if (escaped[0] === '"' && escaped[escaped.length - 1] === '"') {
                escaped = escaped.slice(1, -1);
            }

            try {
                fs.accessSync(escaped, fs.constants.R_OK);
                decompileFile(escaped);
            } catch (err) {
                vscode.window.showErrorMessage('cannot read the file ' + filePath);
            }
        });
    }));

    let lastSelectedNode: MemberNode = null;

    disposables.push(vscode.commands.registerCommand('showDecompiledCode', (node: MemberNode) => {
        if (lastSelectedNode === node) {
            return;
        }

        lastSelectedNode = node;
        if (node.decompiled) {
            showCode(node.decompiled);
        }
        else {
            decompileTreeProvider.getCode(node).then(code => {
                node.decompiled = code;
                showCode(node.decompiled);
            });
        }
    }));

    disposables.push(new vscode.Disposable(() => {
        server.stop();
    }));

    context.subscriptions.push(...disposables);

    function decompileFile(assembly: string) {
        if(!server.isRunning()) {
            server.restart().then(() => {
                decompileTreeProvider.addAssembly(assembly).then(added => {
                    if(added) {
                        decompileTreeProvider.refresh();
                }});
            });
        }
        else {
            decompileTreeProvider.addAssembly(assembly).then(res => {
                if(res) {
                    decompileTreeProvider.refresh();
                }
            });
        }
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function showCode(code: string) {
    if (!textEditor) {
        vscode.workspace.openTextDocument(
            {
                "content": code,
                "language": "csharp"
            }
        ).then(document => {
            vscode.window.showTextDocument(document).then(editor => textEditor = editor);
        });
    }
    else {
        const firstLine = textEditor.document.lineAt(0);
        const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
        const range = new vscode.Range(0,
            firstLine.range.start.character,
            textEditor.document.lineCount - 1,
            lastLine.range.end.character);
        textEditor.edit(editBuilder => editBuilder.replace(range, code));
        vscode.commands.executeCommand("cursorMove", {"to": "viewPortTop"});
    }
}

function pickAssembly(): Thenable<string> {
    return findAssemblies().then(assemblies => {
        return vscode.window.showQuickPick(assemblies);
    });
}

function findAssemblies(): Thenable<string[]> {
    if (!vscode.workspace.rootPath) {
        return Promise.resolve([]);
    }

    return vscode.workspace.findFiles(
        /*include*/ '{**/*.dll,**/*.exe,**/*.winrt,**/*.netmodule}',
        /*exclude*/ '{**/node_modules/**,**/.git/**,**/bower_components/**}')
    .then(resources => {
        return resources.map(uri => uri.fsPath);
    });
}

function promptForAssemblyFilePath(): Thenable<string> {
    return vscode.window.showInputBox(
        /*options*/ {
            prompt: 'Fill in the full path to the managed assembly',
            ignoreFocusOut: true,
            placeHolder: 'full/path/to/the/assembly'
        }
    );
}
