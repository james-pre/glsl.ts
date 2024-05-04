import { Log } from './log.js';
import { Source } from './source.js';
import { TokenKind, TokenKind_isBinaryOperator, TokenKind_isIdentifierOrType, TokenPurpose, tokenize } from './tokenizer.js';

export const enum TrailingNewline {
	PRESERVE,
	REMOVE,
	INSERT,
}

export function _formatWhitespace(text: string, indent: string, newline: string): string {
	let lineCount = 0;
	let i = 0;

	while (i < text.length) {
		const c = text.charCodeAt(i);
		i++;

		if (_isNewline(c)) {
			lineCount++;

			if (c === 13 && i < text.length && text.charCodeAt(i) === 10) {
				i++;
			}
		}
	}

	if (lineCount > 2) {
		lineCount = 2;
	}

	return newline.repeat(lineCount);
}

export function _keepSpaceBetween(prev: TokenKind, left: TokenKind, right: TokenKind): boolean {
	switch (right) {
		case TokenKind.INCREMENT: {
			switch (left) {
				case TokenKind.PLUS: {
					return true;
				}

				case TokenKind.IDENTIFIER: {
					return false;
				}
			}
			break;
		}

		case TokenKind.DECREMENT: {
			switch (left) {
				case TokenKind.MINUS: {
					return true;
				}

				case TokenKind.IDENTIFIER: {
					return false;
				}
			}
			break;
		}

		case TokenKind.PLUS: {
			switch (left) {
				case TokenKind.PLUS: {
					return true;
				}
			}
			break;
		}

		case TokenKind.MINUS: {
			switch (left) {
				case TokenKind.MINUS: {
					return true;
				}
			}
			break;
		}

		case TokenKind.LEFT_PARENTHESIS: {
			if (TokenKind_isIdentifierOrType(left) || left === TokenKind.RIGHT_BRACKET) {
				return false;
			}
			break;
		}

		case TokenKind.LEFT_BRACKET: {
			if (TokenKind_isIdentifierOrType(left) || left === TokenKind.RIGHT_BRACKET) {
				return false;
			}
			break;
		}

		case TokenKind.COMMA:
		case TokenKind.SEMICOLON:
		case TokenKind.RIGHT_PARENTHESIS:
		case TokenKind.RIGHT_BRACKET:
		case TokenKind.DOT: {
			return false;
		}

		case TokenKind.RIGHT_BRACE: {
			if (left === TokenKind.LEFT_BRACE) {
				return false;
			}
			break;
		}
	}

	switch (left) {
		case TokenKind.LEFT_PARENTHESIS:
		case TokenKind.LEFT_BRACKET:
		case TokenKind.DOT:
		case TokenKind.NOT:
		case TokenKind.COMPLEMENT: {
			return false;
		}

		case TokenKind.PLUS:
		case TokenKind.MINUS: {
			switch (prev) {
				case TokenKind.END_OF_FILE:
				case TokenKind.LEFT_PARENTHESIS:
				case TokenKind.LEFT_BRACKET:
				case TokenKind.COMMA:
				case TokenKind.COLON:
				case TokenKind.SEMICOLON:
				case TokenKind.NOT:
				case TokenKind.COMPLEMENT:
				case TokenKind.RETURN:
				case TokenKind.ELSE: {
					return false;
				}
			}

			if (TokenKind_isBinaryOperator(prev)) {
				return false;
			}
			break;
		}

		case TokenKind.INCREMENT:
		case TokenKind.DECREMENT: {
			switch (right) {
				case TokenKind.IDENTIFIER: {
					return false;
				}
			}
			break;
		}
	}

	return true;
}

export function _isNewline(c: number): boolean {
	return c === 10 || c === 13;
}

export function _hasNewline(text: string): boolean {
	for (let i = 0, n = text.length; i < n; i++) {
		if (_isNewline(text.charCodeAt(i))) {
			return true;
		}
	}

	return false;
}

export function _isWhitespace(c: number): boolean {
	return c === 32 || c === 9;
}

export function _isAllWhitespace(text: string): boolean {
	for (let i = 0, n = text.length; i < n; i++) {
		if (!_isWhitespace(text.charCodeAt(i))) {
			return false;
		}
	}

	return true;
}

export function _trimSingleLineComment(text: string): string {
	let i = text.length;

	while (_isWhitespace(text.charCodeAt(i - 1))) {
		i = i - 1;
	}

	return text.slice(0, i);
}

export function _trimMultiLineComment(comment: string, beforeComment: string, indent: string, newline: string): string {
	// Split the comment contents into lines
	const lines: string[] = [];
	let start = 0;

	for (let i = 0, n = comment.length; i < n; i++) {
		const c = comment.charCodeAt(i);

		if (_isNewline(c)) {
			lines.push(comment.slice(start, i));

			if (c === 13 && i + 1 < n && comment.charCodeAt(i + 1) === 10) {
				i++;
			}

			start = i + 1;
		}
	}

	lines.push(comment.slice(start));

	// Find the start of the line containing the start of the comment
	let firstLine = beforeComment.length;

	while (firstLine > 0 && !_isNewline(beforeComment.charCodeAt(firstLine - 1))) {
		firstLine = firstLine - 1;
	}

	const lineBeforeComment = beforeComment.slice(firstLine);

	// Determine the common whitespace prefix
	let commonPrefix = lineBeforeComment;

	for (const line of lines.slice(1)) {
		if (_isAllWhitespace(line)) {
			continue;
		}

		let i1 = 0;
		const n1 = line.length;

		while (i1 < n1 && i1 < commonPrefix.length && line.charCodeAt(i1) === commonPrefix.charCodeAt(i1)) {
			i1 = i1 + 1;
		}

		commonPrefix = commonPrefix.slice(0, i1);
	}

	// Join the lines together
	let result = '';

	for (const line1 of lines) {
		if (result === '') {
			if (_isAllWhitespace(lineBeforeComment)) {
				result += lineBeforeComment.slice(commonPrefix.length);
			}

			result += line1;
		} else {
			result += newline;

			if (!_isAllWhitespace(line1)) {
				result += indent + line1.slice(commonPrefix.length);
			}
		}
	}

	return result;
}

export function format(input: string, indent: string, newline: string, trailingNewline: TrailingNewline): string {
	const log = new Log();
	const source = new Source('<stdin>', input);
	const tokens = tokenize(log, source, TokenPurpose.FORMAT);

	if (log.hasErrors()) {
		return input;
	}

	let text = '';
	let prevPrevKind = TokenKind.END_OF_FILE;
	let prevKind = TokenKind.END_OF_FILE;
	let prevEnd = 0;
	let nesting = 0;
	let isStartOfLine = true;
	let tokenIndex = 0;
	let consumeIf: (v0: (v0: TokenKind) => boolean) => boolean = null;
	const hasNewlineBefore: (v0: number) => boolean = (index: number) => {
		return !_isAllWhitespace(input.slice(tokens[index - 1].range.end, tokens[index].range.start));
	};
	const isStatementEnd: (v0: TokenKind, v1: boolean) => boolean = (kind: TokenKind, isFirst: boolean) => {
		switch (kind) {
			case TokenKind.SEMICOLON:
			case TokenKind.RIGHT_BRACE: {
				return true;
			}

			// Recover when there's a missing semicolon. These tokens are always
			// guaranteed to start a new statement. They must not be able to appear
			// past the first token in a statement or the statement may incorrectly
			// end early.
			case TokenKind.BREAK:
			case TokenKind.CONTINUE:
			case TokenKind.DISCARD:
			case TokenKind.DO:
			case TokenKind.ELSE:
			case TokenKind.FOR:
			case TokenKind.IF:
			case TokenKind.RETURN:
			case TokenKind.WHILE: {
				return !isFirst;
			}
		}

		return false;
	};
	let handleStatement: () => boolean = null;

	// Scan over non-block bodies until the ending ";"
	const handleBody: () => void = () => {
		let intended = 1;

		for (let i = tokenIndex; i < tokens.length; i++) {
			switch (tokens[i].kind) {
				// A comment doesn't count as a body
				case TokenKind.SINGLE_LINE_COMMENT:
				case TokenKind.MULTI_LINE_COMMENT: {
					continue;
				}

				case TokenKind.LEFT_BRACE: {
					intended = 0;
					break;
				}
			}

			break;
		}

		nesting = nesting + intended;
		handleStatement();
		nesting = nesting - intended;
	};

	// "if" or "for" or "while"
	const handleBranch: () => boolean = () => {
		// Double-indent in parentheses unless they are followed by a newline
		let doubleIndent = 1;

		if (tokens[tokenIndex].kind === TokenKind.LEFT_PARENTHESIS && hasNewlineBefore(tokenIndex + 1)) {
			doubleIndent = 0;
		}

		nesting = nesting + doubleIndent;

		if (
			!consumeIf((kind: TokenKind) => {
				return kind === TokenKind.LEFT_PARENTHESIS;
			})
		) {
			nesting = nesting - doubleIndent;
			return false;
		}

		nesting = nesting - doubleIndent;
		return true;
	};
	handleStatement = () => {
		// Comments don't count as a statement
		while (
			consumeIf((kind: TokenKind) => {
				return kind === TokenKind.SINGLE_LINE_COMMENT || kind === TokenKind.MULTI_LINE_COMMENT;
			})
		) {}

		switch (tokens[tokenIndex].kind) {
			case TokenKind.END_OF_FILE:
			case TokenKind.RIGHT_BRACE: {
				return false;
			}

			case TokenKind.IMPORT:
			case TokenKind.EXPORT: {
				consumeIf((kind: TokenKind) => {
					return true;
				});
				break;
			}

			case TokenKind.IF: {
				consumeIf((kind: TokenKind) => {
					return true;
				});

				if (handleBranch()) {
					handleBody();
				}

				// Consume an "else" after the if so it gets this statement's indentation level
				if (tokens[tokenIndex].kind === TokenKind.ELSE) {
					handleStatement();
				}
				break;
			}

			case TokenKind.FOR:
			case TokenKind.WHILE: {
				consumeIf((kind: TokenKind) => {
					return true;
				});

				if (handleBranch()) {
					handleBody();
				}
				break;
			}

			case TokenKind.DO: {
				consumeIf((kind: TokenKind) => {
					return true;
				});
				handleBody();

				if (
					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.WHILE;
					})
				) {
					handleBranch();
					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.SEMICOLON;
					});
				}
				break;
			}

			case TokenKind.ELSE: {
				consumeIf((kind: TokenKind) => {
					return true;
				});

				if (tokens[tokenIndex].kind === TokenKind.IF) {
					const isOnNewLine = hasNewlineBefore(tokenIndex);

					if (isOnNewLine) {
						nesting = nesting + 1;
					}

					consumeIf((kind: TokenKind) => {
						return true;
					});

					if (handleBranch()) {
						handleBody();
					}

					if (isOnNewLine) {
						nesting = nesting - 1;
					}
				} else {
					handleBody();
				}
				break;
			}

			case TokenKind.LEFT_BRACE:
			case TokenKind.SEMICOLON: {
				consumeIf((kind: TokenKind) => {
					return true;
				});
				break;
			}

			case TokenKind.EXTENSION:
			case TokenKind.VERSION:
			case TokenKind.INCLUDE:
			case TokenKind.PRAGMA: {
				consumeIf((kind: TokenKind) => {
					return true;
				});

				while (
					consumeIf((kind: TokenKind) => {
						return !hasNewlineBefore(tokenIndex);
					})
				) {}
				break;
			}

			default: {
				const couldBeType = TokenKind_isIdentifierOrType(tokens[tokenIndex].kind);
				consumeIf((kind: TokenKind) => {
					return true;
				});

				// Handle function declarations
				if (
					couldBeType &&
					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.IDENTIFIER;
					}) &&
					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.LEFT_PARENTHESIS;
					})
				) {
					if (
						!consumeIf((kind: TokenKind) => {
							return kind === TokenKind.LEFT_BRACE;
						})
					) {
						consumeIf((kind: TokenKind) => {
							return kind === TokenKind.SEMICOLON;
						});
					}
				} else {
					let isMultiLine = false;

					while (true) {
						if (!isMultiLine && hasNewlineBefore(tokenIndex)) {
							isMultiLine = true;
							nesting = nesting + 1;
						}

						if (
							!consumeIf((kind: TokenKind) => {
								return !isStatementEnd(kind, false);
							})
						) {
							break;
						}
					}

					consumeIf((kind: TokenKind) => {
						return kind === TokenKind.SEMICOLON;
					});

					if (isMultiLine) {
						nesting = nesting - 1;
					}
				}
				break;
			}
		}

		return true;
	};
	const indexOfClosingBrace: () => number = () => {
		const stack: TokenKind[] = [];
		let i = tokenIndex;

		while (i < tokens.length) {
			const kind = tokens[i].kind;

			switch (kind) {
				case TokenKind.LEFT_BRACE:
				case TokenKind.LEFT_BRACKET:
				case TokenKind.LEFT_PARENTHESIS: {
					stack.push(kind);
					break;
				}

				case TokenKind.RIGHT_BRACE: {
					if (stack.length === 0) {
						return i;
					}

					if (stack.pop() !== TokenKind.LEFT_BRACE) {
						return -1;
					}
					break;
				}

				case TokenKind.RIGHT_BRACKET: {
					if (stack.length === 0 || stack.pop() !== TokenKind.LEFT_BRACKET) {
						return -1;
					}
					break;
				}

				case TokenKind.RIGHT_PARENTHESIS: {
					if (stack.length === 0 || stack.pop() !== TokenKind.LEFT_PARENTHESIS) {
						return -1;
					}
					break;
				}
			}

			i++;
		}

		return -1;
	};
	let forceMultiLine = -1;
	const handleBraces: () => void = () => {
		const rightBrace = indexOfClosingBrace();
		const isMultiLine = rightBrace !== -1 && _hasNewline(input.slice(tokens[tokenIndex - 1].range.end, tokens[rightBrace].range.start));

		if (isMultiLine) {
			forceMultiLine = tokenIndex;
		}

		nesting = nesting + 1;

		while (handleStatement()) {}

		nesting = nesting - 1;

		if (isMultiLine) {
			forceMultiLine = tokenIndex;
		}

		consumeIf((kind: TokenKind) => {
			return kind === TokenKind.RIGHT_BRACE;
		});
	};
	const handleParentheses: () => void = () => {
		nesting = nesting + 1;

		while (
			consumeIf((kind: TokenKind) => {
				return kind !== TokenKind.RIGHT_PARENTHESIS;
			})
		) {}

		nesting = nesting - 1;
		consumeIf((kind: TokenKind) => {
			return kind === TokenKind.RIGHT_PARENTHESIS;
		});
	};
	const handleBrackets: () => void = () => {
		nesting = nesting + 1;

		while (
			consumeIf((kind: TokenKind) => {
				return kind !== TokenKind.RIGHT_BRACKET;
			})
		) {}

		nesting = nesting - 1;
		consumeIf((kind: TokenKind) => {
			return kind === TokenKind.RIGHT_BRACKET;
		});
	};
	consumeIf = (when: (v0: TokenKind) => boolean) => {
		const token = tokens[tokenIndex];

		if (!when(token.kind) || token.kind === TokenKind.END_OF_FILE) {
			return false;
		}

		const newlines =
			forceMultiLine === tokenIndex ? '\n' : prevKind === TokenKind.END_OF_FILE ? '' : _formatWhitespace(input.slice(prevEnd, token.range.start), indent, newline);
		tokenIndex = tokenIndex + 1;
		text += newlines;

		if (newlines !== '') {
			isStartOfLine = true;
		}

		if (isStartOfLine) {
			text += indent.repeat(nesting);
		} else if (_keepSpaceBetween(prevPrevKind, prevKind, token.kind)) {
			text += ' ';
		}

		let slice = token.range.toString();

		switch (token.kind) {
			case TokenKind.SINGLE_LINE_COMMENT: {
				slice = _trimSingleLineComment(slice);
				break;
			}

			case TokenKind.MULTI_LINE_COMMENT: {
				slice = _trimMultiLineComment(slice, input.slice(0, token.range.start), indent.repeat(nesting), newline);
				break;
			}
		}

		text += slice;
		prevPrevKind = prevKind;
		prevKind = token.kind;
		prevEnd = token.range.end;
		isStartOfLine = false;

		switch (token.kind) {
			case TokenKind.LEFT_BRACE: {
				handleBraces();
				break;
			}

			case TokenKind.LEFT_PARENTHESIS: {
				handleParentheses();
				break;
			}

			case TokenKind.LEFT_BRACKET: {
				handleBrackets();
				break;
			}
		}

		return true;
	};

	// Consume all tokens
	while (
		handleStatement() ||
		consumeIf((kind: TokenKind) => {
			return kind !== TokenKind.END_OF_FILE;
		})
	) {}

	const newlines = _formatWhitespace(input.slice(prevEnd), indent, newline);

	switch (trailingNewline) {
		case TrailingNewline.PRESERVE: {
			if (newlines !== '') {
				text += newline;
			}
			break;
		}

		case TrailingNewline.INSERT: {
			if (text !== '') {
				text += newline;
			}
			break;
		}
	}

	return text;
}
