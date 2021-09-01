import { 
    IPCMessageReader, IPCMessageWriter, createConnection,
    TextDocuments, TextDocumentSyncKind
} from "vscode-languageserver/node";

import { TextDocument } from 'vscode-languageserver-textdocument';

import { CompletionRepository } from './completions';

let connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
let documents = new TextDocuments(TextDocument);

let completions = new CompletionRepository(documents);

connection.onInitialize((params) => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: false
            },
            signatureHelpProvider: {
                triggerCharacters: ["("]
            },
            workspace: {
                workspaceFolders: {
                    supported: false
                }
            }
        }
    };
});

connection.onDidChangeConfiguration((change) => {
    let sm_home = change.settings.sourcepawnLanguageServer.sourcemod_home;
    if (sm_home) {
        completions.parse_sm_api(sm_home);
    }
})

connection.onCompletion((textDocumentPosition) => {
    return completions.get_completions(textDocumentPosition);
});

connection.onSignatureHelp((textDocumentPosition) => {
    return completions.get_signature(textDocumentPosition);
});

documents.listen(connection);
connection.listen();