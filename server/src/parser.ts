import { FileCompletions, FunctionCompletion, DefineCompletion, FunctionParam, MethodCompletion } from './completions';
import * as fs from 'fs';

export function parse_file(file: string, completions: FileCompletions) {
    fs.readFile(file, "utf-8", (err, data) => {
        parse_blob(data, completions);
    });
}

export function parse_blob(data: string, completions: FileCompletions) {
    if (typeof data === 'undefined') {
        return // Asked to parse empty file
    }
    
    let lines = data.split("\n");
    let parser = new Parser(lines, completions);

    parser.parse();
}

enum State {
    None,
    MultilineComment,
    DocComment,
    Enum,
    Methodmap,
    Property,
    StatementBody
}

class Parser {
    lines: string[];
    completions: FileCompletions;
    state: State[];
    scratch: string[];
    state_data: any;

    constructor(lines: string[], completions: FileCompletions) {
        this.lines = lines;
        this.completions = completions;
        this.state = [State.None];
        this.scratch = [];
    }

    parse() {
        let line = this.lines.shift();
        if (typeof line === 'undefined') {
            return;
        }

        let match = line.match(/\s*#define\s+([A-Za-z0-9_]+)/);
        if (match) {
            this.completions.add(match[1], new DefineCompletion(match[1]));
            return this.parse();
        }

        match = line.match(/^\s*#include\s+<([A-Za-z0-9\-_\/]+)>\s*$/);
        if (match) {
            this.completions.resolve_import(match[1]);
            return this.parse();
        }

        match = line.match(/^\s*#include\s+"([A-Za-z0-9\-_\/]+)"\s*$/);
        if (match) {
            this.completions.resolve_import(match[1], true);
            return this.parse();
        }
    
        match = line.match(/\s*\/\*/);
        if (match) {
            this.state.push(State.MultilineComment);
            this.scratch = [];

            this.consume_multiline_comment(line);
            return this.parse();
        }

        match = line.match(/^\s*\/\//);
        if (match) {
            if (this.lines[0] && this.lines[0].match(/^\s*\/\//)) {
                this.state.push(State.MultilineComment);
                this.scratch = [];

                this.consume_multiline_comment(line, true);
                return this.parse();
            } else {
                this.scratch = [line];
                return this.parse();
            }
        }

        match = line.match(/^\s*methodmap\s+([a-zA-Z][a-zA-Z0-9_]*)(?:\s+<\s+([a-zA-Z][a-zA-Z0-9_]*))?/);
        if (match) {
            this.state.push(State.Methodmap);
            this.state_data = {
                name: match[1]
            };

            return this.parse();
        }

        match = line.match(/^\s*property\s+([a-zA-Z][a-zA-Z0-9_]*)\s+([a-zA-Z][a-zA-Z0-9_]*)/);
        if (match) {
            if (this.state[this.state.length - 1] === State.Methodmap) {
                this.state.push(State.Property);
            }

            return this.parse();
        }

        match = line.match(/{/);
        if (match) {
            this.state.push(State.StatementBody);
            return this.consume_function_body();
        }

        match = line.match(/}/);
        if (match) {
            this.state.pop();

            return this.parse();
        }

        this.read_function(line);
        this.parse();
    }

    consume_function_body() {
        let line = this.lines.shift();
        if (typeof line === 'undefined') {
            return;
        }

        let match = line.match(/{/);
        if (match) {
            this.state.push(State.StatementBody);
            return this.consume_function_body();
        }

        match = line.match(/}/);
        if (match) {
            this.state.pop();
        }

        if (this.state[this.state.length - 1] !== State.StatementBody) {
            return this.parse();
        } else {
            return this.consume_function_body();
        }
    }

    consume_multiline_comment(current_line: string, use_line_comment: boolean = false) {
        if (typeof current_line === 'undefined') {
            return; // EOF
        }

        let match: any = (use_line_comment) ? !/^\s*\/\//.test(current_line) : /\*\//.test(current_line);
        if (match) {
            if (use_line_comment) {
                this.lines.unshift(current_line);
            }

            this.state.pop();
            return this.parse();
        } else {
            this.scratch.push(current_line);
            this.consume_multiline_comment(this.lines.shift(), use_line_comment);
        }
    }

    read_function(line: string) {
        if (typeof line === 'undefined') {
            return;
        }
        
        // TODO: Support multiline function definitions
        if (line.includes(":")) {
            this.read_old_style_function(line);
        } else {
            this.read_new_style_function(line);
        }
    }

    read_old_style_function(line: string) {
        let match = line.match(/\s*(?:(?:static|native|stock|public)+\s*)*(?:[a-zA-Z\-_0-9]:)?([^\s]+)\s*\(\s*([^\)]*)\)/);
        if (match) {
            let {description, params} = this.parse_doc_comment();
            this.completions.add(match[1], new FunctionCompletion(match[1], match[2], description, params));
        }
    }

    read_new_style_function(line: string) {
        let match = line.match(/\s*(?:(?:static|native|stock|public)\s*)*([^\s]+)\s*([A-z_][A-z0-9_]*\s*\(\s*([^\)]*)\))/);
        if (match) {
            let {description, params} = this.parse_doc_comment();

            let name_match = match[2].match(/^([A-z_][A-z0-9_]*)/);
            if (this.state[this.state.length - 1] === State.Methodmap) {
                this.completions.add(name_match[1], new MethodCompletion(this.state_data.name, name_match[1], match[2], description, params))
            } else {
                this.completions.add(name_match[1], new FunctionCompletion(name_match[1], match[2], description, params));
            }
        }
    }

    parse_doc_comment(): {description: string, params: FunctionParam[]} {
        let description = (() => {
            let lines = [];
            for (let line of this.scratch) {
                if (/^\s*\/\*/.test(line)) {
                    continue;
                }

                if (!(/^\s*\*\s+([^@].*)/.test(line) || /^\s*\/\/\s+([^@].*)/.test(line))) {
                    break;
                }

                lines.push(line.replace(/^\s*\*\s+/, "").replace(/^\s*\/\/\s+/, ""));
            }

            return lines.join(' ');
        })();
        
        const paramRegex = /@param\s+([A-Za-z0-9_\.]+)\s+(.*)/;
        let params = (() => {
            let params = [];
            let current_param;
            for (let line of this.scratch) {
                let match = line.match(paramRegex);
                if (match) {
                    if (current_param) {
                        current_param.documentation = current_param.documentation.join(' ');
                        params.push(current_param);
                    }

                    current_param = {label: match[1], documentation: [match[2]]};
                } else {
                    if (!/@(?:return|error)/.test(line)) {
                        let match = line.match(/\s*(?:\*|\/\/)\s*(.*)/);
                        if (match) {
                            if (current_param) {
                                current_param.documentation.push(match[1])
                            }
                        }
                    } else {
                        if (current_param) {
                            current_param.documentation = current_param.documentation.join(' ');
                            params.push(current_param);
                            
                            current_param = undefined;
                        }
                    }
                }
            }

            return params;
        })();

        return {description, params}
    }
}