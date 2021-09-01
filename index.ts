import { ExtensionContext, workspace, window, commands } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import * as glob from 'glob';
import * as path from 'path';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    let serverModule = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
    let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };
   
    glob(path.join(workspace.rootPath || "", "**/include/sourcemod.inc"), (err, files) => {
        if (files.length === 0) {
            if (!workspace.getConfiguration("sourcepawnLanguageServer").get("sourcemod_home")) {
                window.showWarningMessage("SourceMod API not found in the project. You may need to set SourceMod Home for autocompletion to work", "Open Settings").then((choice) => {
                    if (choice === 'Open Settings') {
                        commands.executeCommand("workbench.action.openWorkspaceSettings");
                    }
                });
            }
        } else {
            if (!workspace.getConfiguration("sourcepawnLanguageServer").get("sourcemod_home")) {
                workspace.getConfiguration("sourcepawnLanguageServer").update("sourcemod_home", path.dirname(files[0]));
            }
        }
    });

    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [{ language: 'sourcepawn' }],
        synchronize: {
            configurationSection: 'sourcepawnLanguageServer',
            fileEvents: [workspace.createFileSystemWatcher('**/*.sp'), workspace.createFileSystemWatcher('**/*.inc')]
        }
    };

    client = new LanguageClient('SourcePawn Language Server', serverOptions, clientOptions);
    client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}