import { CompilerData, CompilerOptions, ExtensionBehavior } from './compiler.js';
import { Node, NodeKind, NodeKind_isBinary, NodeKind_isJump, NodeKind_isLiteral } from './node.js';
import { VariableKind, VariableSymbol, BaseSymbol } from './symbol.js';
import { Type } from './type.js';

export class Rewriter {
	_codeWasChanged: boolean;
	_variables: VariableSymbol[];
	_useCounts: Map<number, number>;
	_mutationCounts: Map<number, number>;
	_referencedExtensions: Map<string, number>;

	static rewrite(global: Node, data: CompilerData, options: CompilerOptions): void {
		while (true) {
			const rewriter = new Rewriter();

			if (!options.disableRewriting) {
				rewriter._compact(global);
			}

			if (options.trimSymbols) {
				rewriter._scanSymbols(global);
				rewriter._trimSymbols(global);
				rewriter._trimUnreferencedExtensions(global, data);
			}

			if (!rewriter._codeWasChanged) {
				break;
			}
		}

		// Braces removal around "if" statements is subtle due to the dangling else
		// problem:
		//
		//   "if (a) { if (b) c; } else d;" => must keep braces
		//   "if (a) { for (;;) if (b) c; } else d;" => must keep braces
		//   "if (a) { for (;;) { if (b) c; } } else d;" => "if (a) for (;;) { if (b) c; } else d;" or "if (a) { for (;;) if (b) c; } else d;"
		//
		// Instead of trying to preserve all of this during various transforms, just
		// add it back at the end.
		if (!options.disableRewriting) {
			Rewriter._addBracesToAvoidDanglingElseIssues(global);
		}
	}

	// Returns true if braces are required
	static _addBracesToAvoidDanglingElseIssues(node: Node): boolean {
		switch (node.kind) {
			case NodeKind.IF: {
				if (node.ifFalse() === null) {
					return true;
				}

				const yes = node.ifTrue();
				const needsBraces = Rewriter._addBracesToAvoidDanglingElseIssues(yes);

				if (needsBraces && yes.kind !== NodeKind.BLOCK) {
					yes.replaceWith(Node.createBlock().appendChild(yes.cloneAndStealChildren()));
				}

				return Rewriter._addBracesToAvoidDanglingElseIssues(node.ifFalse());
			}

			case NodeKind.FOR: {
				return Rewriter._addBracesToAvoidDanglingElseIssues(node.forBody());
			}

			case NodeKind.FUNCTION: {
				const _function = node.symbol.asFunction();

				if (_function.block) {
					Rewriter._addBracesToAvoidDanglingElseIssues(_function.block);
				}
				break;
			}

			case NodeKind.WHILE: {
				return Rewriter._addBracesToAvoidDanglingElseIssues(node.whileBody());
			}

			default: {
				for (let child = node.firstChild(); child; child = child.nextSibling()) {
					Rewriter._addBracesToAvoidDanglingElseIssues(child);
				}

				return false;
			}
		}

		return false;
	}

	_reportCodeChange(): void {
		this._codeWasChanged = true;
	}

	_scanSymbols(node: Node): void {
		for (let child = node.firstChild(); child; child = child.nextSibling()) {
			this._scanSymbols(child);
		}

		switch (node.kind) {
			case NodeKind.VARIABLE: {
				const variable = node.symbol.asVariable();

				if (variable.value()) {
					this._scanSymbols(variable.value());
				}

				if (variable.kind === VariableKind.LOCAL || variable.kind === VariableKind.GLOBAL) {
					this._variables.push(variable);
					this._useCounts.set(variable.id, 0);
					this._mutationCounts.set(variable.id, 0);
				}
				break;
			}

			case NodeKind.FUNCTION: {
				const _function = node.symbol.asFunction();
				this._useCounts.set(_function.id, 0);

				if (_function.block) {
					this._scanSymbols(_function.block);
				}
				break;
			}

			case NodeKind.NAME: {
				// Track uses
				const id = node.symbol.id;
				let count = this._useCounts[id] ?? -1;

				if (count !== -1) {
					this._useCounts.set(id, count + 1);
				}

				// Track mutations
				if (node.isUsedInStorage()) {
					count = this._mutationCounts[id] ?? -1;

					if (count !== -1) {
						this._mutationCounts.set(id, count + 1);
					}
				}

				// Track referenced extensions
				const name = node.symbol.requiredExtension;

				if (name) {
					this._referencedExtensions.set(name, 0);
				}
				break;
			}
		}
	}

	_trimSymbols(node: Node): void {
		for (let child = node.firstChild(), next: Node = null; child; child = next) {
			next = child.nextSibling();
			this._trimSymbols(child);
		}

		switch (node.kind) {
			case NodeKind.VARIABLE: {
				if (
					this._hasLiteralConstantValue(node.symbol) ||
					this._isNonMutatedLiteral(node.symbol) ||
					(this._isUnused(node.symbol) && (node.variableInitializer() === null || node.variableInitializer().hasNoSideEffects() || node.symbol.constantValue))
				) {
					node.remove();
					this._reportCodeChange();
				} else {
					if (node.variableInitializer()) {
						this._trimSymbols(node.variableInitializer());
					}

					// The array count "int x[1]" is not in the AST and will not be
					// visited during an AST traversal. Special-case it here so constants
					// inside it are still replaced.
					const arrayCount = node.symbol.asVariable().arrayCount;

					if (arrayCount && arrayCount.kind === NodeKind.NAME) {
						const clone = this._literalConstantForSymbol(arrayCount.symbol);

						if (clone) {
							node.symbol.asVariable().arrayCount = clone;
							this._reportCodeChange();
						}
					}
				}
				break;
			}

			case NodeKind.FUNCTION: {
				const _function = node.symbol.asFunction();

				if (this._isUnused(_function as BaseSymbol) && !_function.isExported()) {
					node.remove();
					this._reportCodeChange();
				} else if (_function.block) {
					this._trimSymbols(_function.block);
				}
				break;
			}

			case NodeKind.VARIABLES: {
				if (node.variablesType().nextSibling() === null) {
					// If it lives in a block or is global, remove it. Otherwise we can't
					// blindly remove it, or we risk removing the true-branch of an
					// if-statement or the body of a for-loop, leading to an invalid AST.
					const parentKind = node.parent().kind;

					if (parentKind === NodeKind.BLOCK || parentKind === NodeKind.GLOBAL || parentKind === NodeKind.STRUCT) {
						node.remove();
					} else if (parentKind === NodeKind.FOR) {
						node.become(Node.createSequence());
					} else {
						node.become(Node.createBlock());
					}

					this._reportCodeChange();
				}
				break;
			}

			case NodeKind.NAME: {
				const clone1 = this._literalConstantForSymbol(node.symbol);

				if (clone1) {
					node.replaceWith(clone1);
					this._reportCodeChange();
				}
				break;
			}
		}
	}

	_literalConstantForSymbol(symbol: BaseSymbol): Node {
		if (this._hasLiteralConstantValue(symbol)) {
			return symbol.constantValue.clone();
		}

		if (this._isNonMutatedLiteral(symbol)) {
			return symbol.asVariable().value().clone();
		}

		return;
	}

	_trimUnreferencedExtensions(node: Node, data: CompilerData): void {
		for (let child = node.firstChild(), next: Node = null; child; child = next) {
			next = child.nextSibling();

			if (
				child.kind === NodeKind.EXTENSION &&
				!this._referencedExtensions.has(child.extensionName()) &&
				data.extensionBehavior(child.extensionName()) === ExtensionBehavior.DEFAULT
			) {
				child.remove();
			}
		}
	}

	_isUnused(symbol: BaseSymbol): boolean {
		return (
			(this._useCounts.get(symbol.id) ?? -1) === 0 &&
			((!symbol.isFunction() || symbol.asFunction()!.sibling || this._useCounts.get(symbol.asFunction().sibling.id)) ?? -1) === 0
		);
	}

	_hasLiteralConstantValue(symbol: BaseSymbol): boolean {
		return symbol.constantValue && NodeKind_isLiteral(symbol.constantValue.kind);
	}

	_isNonMutatedLiteral(symbol: BaseSymbol): boolean {
		return (this._mutationCounts.get(symbol.id) ?? -1) === 0 && symbol.asVariable().value() && NodeKind_isLiteral(symbol.asVariable().value().kind);
	}

	_compact(node: Node): void {
		for (let child = node.firstChild(), next: Node = null; child; child = next) {
			next = child.nextSibling();
			this._compact(child);
		}

		switch (node.kind) {
			case NodeKind.VARIABLE: {
				const variable = node.symbol.asVariable();

				if (variable.value()) {
					this._compact(variable.value());
				}
				break;
			}

			case NodeKind.BLOCK: {
				// Remove everything after a jump
				for (let child1 = node.firstChild(); child1; child1 = child1.nextSibling()) {
					if (!NodeKind_isJump(child1.kind)) {
						continue;
					}

					if (child1.nextSibling()) {
						while (child1.nextSibling()) {
							child1.nextSibling().remove();
						}

						this._reportCodeChange();
					}
				}

				// Collapse this block into the parent block if possible, being careful about scope
				if (node.parent() && node.parent().kind === NodeKind.BLOCK) {
					let mayNeedScope = false;

					for (let child2 = node.firstChild(); child2; child2 = child2.nextSibling()) {
						if (child2.kind === NodeKind.VARIABLES) {
							mayNeedScope = true;
						}
					}

					if (!mayNeedScope) {
						node.replaceWithChildren();
						this._reportCodeChange();
						return;
					}
				}
				break;
			}

			case NodeKind.EXPRESSION: {
				if (node.parent().kind === NodeKind.BLOCK) {
					// Remove unnecessary expressions
					if (node.expressionValue().hasNoSideEffects()) {
						node.remove();
						this._reportCodeChange();
						return;
					}

					// Combine with a previous expression, if any (may open up more
					// compacting opportunities in the future)
					const previous = node.previousSibling();

					if (previous && previous.kind === NodeKind.EXPRESSION) {
						const value = node.expressionValue().remove();
						node.appendChild(Node.createSequence().appendChild(previous.remove().expressionValue().remove()).appendChild(value));
						this._reportCodeChange();
						return;
					}
				}
				break;
			}

			case NodeKind.DO_WHILE: {
				this._compactBlockStatement(node.doWhileBody());

				// Do-while with false is no different than a normal block. It is
				// different than just replacing itself with its body though
				// because the body may have shadowing variables that could conflict.
				if (node.doWhileTest().isFalse()) {
					node.replaceWith(Node.createBlock().appendChild(node.doWhileBody().remove()));
					this._reportCodeChange();
				}
				break;
			}

			case NodeKind.FOR: {
				this._compactBlockStatement(node.forBody());

				// Tuck the previous expression inside the setup location if empty
				if (node.forSetup() === null && node.previousSibling() && node.previousSibling().kind === NodeKind.EXPRESSION) {
					node.firstChild().replaceWith(node.previousSibling().expressionValue().remove());
					node.previousSibling().remove();
					this._reportCodeChange();
				}

				// No need to keep "true" around
				if (node.forTest() && node.forTest().isTrue()) {
					node.forTest().replaceWith(Node.createSequence());
					this._reportCodeChange();
				}

				// Remove trailing continues
				if (node.forBody().kind === NodeKind.CONTINUE) {
					node.forBody().replaceWith(Node.createBlock());
					this._reportCodeChange();
				} else {
					while (node.forBody().hasChildren() && node.forBody().lastChild().kind === NodeKind.CONTINUE) {
						node.forBody().lastChild().remove();
						this._reportCodeChange();
					}
				}
				break;
			}

			case NodeKind.FUNCTION: {
				const _function = node.symbol.asFunction();

				if (_function.block) {
					this._compact(_function.block);
				}
				break;
			}

			case NodeKind.IF: {
				this._compactBlockStatement(node.ifTrue());

				if (node.ifFalse()) {
					this._compactBlockStatement(node.ifFalse());
				}

				// Special-case "true"
				if (node.ifTest().isTrue()) {
					node.replaceWith(node.ifTrue().remove());
					this._reportCodeChange();
					return;
				}

				// Special-case "false"
				if (node.ifTest().isFalse()) {
					if (node.ifFalse()) {
						node.replaceWith(node.ifFalse().remove());
					} else {
						node.remove();
					}

					this._reportCodeChange();
					return;
				}

				// Turn if-else statements into a single return statement
				if (node.ifFalse() && node.ifTrue().kind === NodeKind.RETURN && node.ifFalse().kind === NodeKind.RETURN) {
					const yes = node.ifTrue().returnValue();
					const no = node.ifFalse().returnValue();

					if (yes && no) {
						node.replaceWith(Node.createReturn(Node.createHook(node.ifTest().remove(), yes.remove(), no.remove()).withType(yes.resolvedType)));
						this._reportCodeChange();
						return;
					}
				}

				// Turn if-else statements into shorter conditional expressions when possible
				if (node.ifFalse() && node.ifTrue().kind === NodeKind.EXPRESSION && node.ifFalse().kind === NodeKind.EXPRESSION) {
					const yes1 = node.ifTrue().expressionValue();
					const no1 = node.ifFalse().expressionValue();

					if (yes1.resolvedType === no1.resolvedType) {
						node.replaceWith(Node.createExpression(Node.createHook(node.ifTest().remove(), yes1.remove(), no1.remove()).withType(yes1.resolvedType)));
						this._reportCodeChange();
						return;
					}
				}

				// Also turn if statements without else blocks into shorter conditional expressions when possible
				if (node.ifFalse() === null && node.ifTrue().kind === NodeKind.EXPRESSION) {
					const yes2 = node.ifTrue().expressionValue();

					// Only check assignments to local names in case global names aren't renamed (then it will be longer, not shorter)
					const isAssignToArgumentOrLocalName =
						yes2.kind === NodeKind.ASSIGN && yes2.binaryLeft().kind === NodeKind.NAME && yes2.binaryLeft().symbol.isArgumentOrLocalVariable();

					if (yes2.resolvedType === Type.INT || yes2.resolvedType === Type.FLOAT || isAssignToArgumentOrLocalName) {
						const value1: Node = isAssignToArgumentOrLocalName ? yes2.binaryLeft().clone() : yes2.resolvedType === Type.INT ? Node.createInt(0) : Node.createFloat(0);
						node.replaceWith(Node.createExpression(Node.createHook(node.ifTest().remove(), yes2.remove(), value1).withType(yes2.resolvedType)));
						this._reportCodeChange();
						return;
					}
				}

				// Inline a true-only branch
				if (node.ifFalse() === null && node.ifTrue().kind === NodeKind.IF && node.ifTrue().ifFalse() === null) {
					const left = node.ifTest();
					const right = node.ifTrue().ifTest();
					const body = node.ifTrue().ifTrue();
					left.become(Node.createBinary(NodeKind.LOGICAL_AND, left.cloneAndStealChildren(), right.remove()).withType(Type.BOOL));
					node.ifTrue().become(body.remove());
					this._reportCodeChange();
					return;
				}

				// Remove an empty true branch
				if (node.ifTrue().isEmptyBlock()) {
					if (node.ifFalse()) {
						node.ifTest().invertBooleanCondition();
						node.ifTrue().remove();
					} else {
						node.replaceWith(Node.createExpression(node.ifTest().remove()));
					}

					this._reportCodeChange();
					return;
				}

				// Remove an empty false branch
				if (node.ifFalse() && node.ifFalse().isEmptyBlock()) {
					node.ifFalse().remove();
					this._reportCodeChange();
					return;
				}
				break;
			}

			case NodeKind.RETURN: {
				// Merge with previous if statements if possible
				let previous1 = node.previousSibling();

				while (previous1 && previous1.kind === NodeKind.IF && previous1.ifFalse() === null && previous1.ifTrue().kind === NodeKind.RETURN) {
					const yes3 = previous1.ifTrue().returnValue();
					const no2 = node.returnValue();

					if (!yes3 || !no2) {
						break;
					}

					node.replaceWith(Node.createReturn(Node.createHook(previous1.ifTest().remove(), yes3.remove(), no2.remove()).withType(yes3.resolvedType)));
					previous1.remove();
					previous1 = node.previousSibling();
					this._reportCodeChange();
				}
				break;
			}

			case NodeKind.VARIABLES: {
				for (let previous2 = node.previousSibling(); previous2; previous2 = previous2.previousSibling()) {
					if (previous2.kind !== NodeKind.VARIABLES) {
						break;
					}

					// Combine with a previous variable block if the types and modifiers match
					if (previous2.variablesType().resolvedType === node.variablesType().resolvedType && previous2.variablesFlags() === node.variablesFlags()) {
						while (previous2.lastChild() !== previous2.variablesType()) {
							node.insertChildBefore(node.variablesType().nextSibling(), previous2.lastChild().remove());
						}

						previous2.remove();
						this._reportCodeChange();
						return;
					}

					// Only skip over variable blocks if all variables have constant initializers
					for (let child3 = previous2.variablesType().nextSibling(); child3; child3 = child3.nextSibling()) {
						const initializer = child3.variableInitializer();

						if (initializer && !NodeKind_isLiteral(initializer.kind)) {
							return;
						}
					}
				}
				break;
			}

			case NodeKind.WHILE: {
				// Turn into a for loop since they are more versatile
				const test = node.whileTest();
				const body1 = node.whileBody();
				node.replaceWith(Node.createFor(null, test.remove(), null, body1.remove()));
				this._reportCodeChange();
				break;
			}

			case NodeKind.HOOK: {
				const test1 = node.hookTest();
				const yes4 = node.hookTrue();
				const no3 = node.hookFalse();

				// Special-case "true"
				if (test1.isTrue()) {
					node.become(yes4.remove());
					this._reportCodeChange();
					return;
				}

				// Special-case "false"
				if (test1.isFalse()) {
					node.become(no3.remove());
					this._reportCodeChange();
					return;
				}

				// Special-case binary operators on both branches, likely assignments.
				// Ignore INDEX expressions because GLSL requires the index value to
				// be a constant expression, and HOOK expressions aren't constant.
				if (yes4.kind === no3.kind && NodeKind_isBinary(yes4.kind) && yes4.binaryLeft().looksTheSameAs(no3.binaryLeft()) && yes4.kind !== NodeKind.INDEX) {
					const common = yes4.binaryLeft();
					const left1 = yes4.binaryRight();
					const right1 = no3.binaryRight();
					const value2 = Node.createHook(test1.remove(), left1.remove(), right1.remove());
					node.become(Node.createBinary(yes4.kind, common.remove(), value2));
					this._reportCodeChange();
					return;
				}

				// Special-case an assignment and the assignment target, generated by if statement conversion
				if (yes4.kind === NodeKind.ASSIGN && yes4.binaryLeft().looksTheSameAs(no3) && no3.hasNoSideEffects()) {
					const common1 = yes4.binaryLeft();
					const left2 = yes4.binaryRight();
					const value3 = Node.createHook(test1.remove(), left2.remove(), no3.remove());
					node.become(Node.createBinary(NodeKind.ASSIGN, common1.remove(), value3));
					this._reportCodeChange();
					return;
				}
				break;
			}

			case NodeKind.SEQUENCE: {
				// Remove elements without side effects
				for (let child4 = node.firstChild(), next1: Node = null; child4 !== node.lastChild(); child4 = next1) {
					next1 = child4.nextSibling();

					if (child4.hasNoSideEffects()) {
						child4.remove();
						this._reportCodeChange();
					}
				}

				// Inline nested sequences into their parent
				if (node.parent().kind === NodeKind.SEQUENCE) {
					node.replaceWithChildren();
					this._reportCodeChange();
					return;
				}

				// Inline single-element sequences
				if (node.hasOneChild()) {
					node.become(node.firstChild().remove());
					this._reportCodeChange();
					return;
				}
				break;
			}

			case NodeKind.NEGATIVE: {
				const value4 = node.unaryValue();

				// "- -a" => "a"
				if (value4.kind === NodeKind.NEGATIVE) {
					node.become(value4.unaryValue().remove());
					this._reportCodeChange();
				}

				// Constant folding
				else if (value4.kind === NodeKind.INT) {
					this._changeToInt(node, -value4.asInt());
				} else if (value4.kind === NodeKind.FLOAT) {
					this._changeToFloat(node, -value4.asFloat());
				}
				break;
			}

			case NodeKind.NOT: {
				const value5 = node.unaryValue();

				// "!!a" => "a"
				if (value5.kind === NodeKind.NOT) {
					node.become(value5.unaryValue().remove());
					this._reportCodeChange();
				}

				// Constant folding
				else if (value5.kind === NodeKind.BOOL) {
					this._changeToBool(node, !value5.asBool());
				}
				break;
			}

			case NodeKind.POSITIVE: {
				node.become(node.unaryValue().remove());
				break;
			}

			case NodeKind.ADD: {
				const left3 = node.binaryLeft();
				const right2 = node.binaryRight();

				// "0 + a" => "a"
				if (left3.isIntOrFloat(0)) {
					node.become(right2.remove());
					this._reportCodeChange();
				}

				// "a + 0" => "a"
				else if (right2.isIntOrFloat(0)) {
					node.become(left3.remove());
					this._reportCodeChange();
				}

				// Constant folding
				else if (left3.kind === NodeKind.INT && right2.kind === NodeKind.INT) {
					this._changeToInt(node, left3.asInt() + right2.asInt());
				} else if (left3.kind === NodeKind.FLOAT && right2.kind === NodeKind.FLOAT) {
					this._changeToFloat(node, left3.asFloat() + right2.asFloat());
				}
				break;
			}

			case NodeKind.CALL: {
				const target = node.callTarget();

				// Optimize constructor calls
				if (target.kind === NodeKind.TYPE) {
					const type = target.resolvedType;

					// "int(123)" => "123"
					if (type === Type.INT) {
						const child5 = target.nextSibling();

						if (child5 && child5.nextSibling() === null && child5.kind === NodeKind.INT) {
							node.become(child5.remove());
							this._reportCodeChange();
						}
					}

					// "float(123)" => "123.0"
					else if (type === Type.FLOAT) {
						const child6 = target.nextSibling();

						if (child6 && child6.nextSibling() === null && child6.kind === NodeKind.INT) {
							this._changeToFloat(node, child6.asInt());
						}
					}

					// "vec2(1.0, 2.0)" => "vec2(1, 2)"
					else if (type.componentType() === Type.FLOAT) {
						for (let child7 = target.nextSibling(); child7; child7 = child7.nextSibling()) {
							if (child7.kind === NodeKind.FLOAT) {
								const floatValue = child7.asFloat();
								const intValue = floatValue | 0;

								if (floatValue === intValue) {
									this._changeToInt(child7, intValue);
								}
							}
						}
					}
				}
				break;
			}

			case NodeKind.DIVIDE: {
				const left4 = node.binaryLeft();
				const right3 = node.binaryRight();

				// "a / 1" => "a"
				if (right3.isIntOrFloat(1)) {
					node.become(left4.remove());
					this._reportCodeChange();
				}

				// Constant folding (division by 0 is undefined so whatever)
				else if (left4.kind === NodeKind.INT && right3.kind === NodeKind.INT) {
					this._changeToInt(node, right3.asInt() !== 0 ? (left4.asInt() / right3.asInt()) | 0 : 0);
				} else if (left4.kind === NodeKind.FLOAT && right3.kind === NodeKind.FLOAT) {
					this._changeToFloat(node, right3.asFloat() !== 0 ? left4.asFloat() / right3.asFloat() : 0);
				}
				break;
			}

			case NodeKind.EQUAL: {
				const left5 = node.binaryLeft();
				const right4 = node.binaryRight();

				// "a == a" => "true"
				if (left5.looksTheSameAs(right4) && left5.hasNoSideEffects()) {
					this._changeToBool(node, true);
					this._reportCodeChange();
				}

				// Constant folding
				else if (left5.kind === NodeKind.INT && right4.kind === NodeKind.INT) {
					this._changeToBool(node, left5.asInt() === right4.asInt());
				} else if (left5.kind === NodeKind.FLOAT && right4.kind === NodeKind.FLOAT) {
					this._changeToBool(node, left5.asFloat() === right4.asFloat());
				}
				break;
			}

			case NodeKind.GREATER_THAN: {
				const left6 = node.binaryLeft();
				const right5 = node.binaryRight();

				// Constant folding
				if (left6.kind === NodeKind.INT && right5.kind === NodeKind.INT) {
					this._changeToBool(node, left6.asInt() > right5.asInt());
				} else if (left6.kind === NodeKind.FLOAT && right5.kind === NodeKind.FLOAT) {
					this._changeToBool(node, left6.asFloat() > right5.asFloat());
				}
				break;
			}

			case NodeKind.GREATER_THAN_OR_EQUAL: {
				const left7 = node.binaryLeft();
				const right6 = node.binaryRight();

				// "1 >= a" => "2 > a"
				if (left7.kind === NodeKind.INT) {
					node.kind = NodeKind.GREATER_THAN;
					left7.withInt(left7.asInt() + 1);
					this._reportCodeChange();
				}

				// "a >= 1" => "a > 0"
				else if (right6.kind === NodeKind.INT) {
					node.kind = NodeKind.GREATER_THAN;
					right6.withInt(right6.asInt() - 1);
					this._reportCodeChange();
				}

				// Constant folding
				else if (left7.kind === NodeKind.INT && right6.kind === NodeKind.INT) {
					this._changeToBool(node, left7.asInt() >= right6.asInt());
				} else if (left7.kind === NodeKind.FLOAT && right6.kind === NodeKind.FLOAT) {
					this._changeToBool(node, left7.asFloat() >= right6.asFloat());
				}
				break;
			}

			case NodeKind.INDEX: {
				const left8 = node.binaryLeft();
				const right7 = node.binaryRight();
				const type1 = left8.resolvedType;

				// Replace with a swizzle
				if (right7.kind === NodeKind.INT) {
					const index = right7.asInt();
					let bound = 0;
					const value1 = type1;

					if (value1 === Type.BVEC2 || value1 === Type.IVEC2 || value1 === Type.VEC2) {
						bound = 2;
					} else if (value1 === Type.BVEC3 || value1 === Type.IVEC3 || value1 === Type.VEC3) {
						bound = 3;
					} else if (value1 === Type.BVEC4 || value1 === Type.IVEC4 || value1 === Type.VEC4) {
						bound = 4;
					}

					if (index >= 0 && index < bound) {
						node.become(Node.createDot(left8.remove(), 'xyzw'[index]).withType(node.resolvedType));
						this._reportCodeChange();
					}
				}
				break;
			}

			case NodeKind.LESS_THAN: {
				const left9 = node.binaryLeft();
				const right8 = node.binaryRight();

				// Constant folding
				if (left9.kind === NodeKind.INT && right8.kind === NodeKind.INT) {
					this._changeToBool(node, left9.asInt() < right8.asInt());
				} else if (left9.kind === NodeKind.FLOAT && right8.kind === NodeKind.FLOAT) {
					this._changeToBool(node, left9.asFloat() < right8.asFloat());
				}
				break;
			}

			case NodeKind.LESS_THAN_OR_EQUAL: {
				const left10 = node.binaryLeft();
				const right9 = node.binaryRight();

				// "1 <= a" => "0 < a"
				if (left10.kind === NodeKind.INT) {
					node.kind = NodeKind.LESS_THAN;
					left10.withInt(left10.asInt() - 1);
					this._reportCodeChange();
				}

				// "a <= 1" => "a < 2"
				else if (right9.kind === NodeKind.INT) {
					node.kind = NodeKind.LESS_THAN;
					right9.withInt(right9.asInt() + 1);
					this._reportCodeChange();
				}

				// Constant folding
				else if (left10.kind === NodeKind.INT && right9.kind === NodeKind.INT) {
					this._changeToBool(node, left10.asInt() <= right9.asInt());
				} else if (left10.kind === NodeKind.FLOAT && right9.kind === NodeKind.FLOAT) {
					this._changeToBool(node, left10.asFloat() <= right9.asFloat());
				}
				break;
			}

			case NodeKind.LOGICAL_AND: {
				const left11 = node.binaryLeft();
				const right10 = node.binaryRight();

				// "true && a" => "a"
				if (left11.kind === NodeKind.BOOL && left11.isTrue()) {
					node.become(right10.remove());
					this._reportCodeChange();
				}

				// Constant folding
				else if (left11.kind === NodeKind.BOOL && left11.isFalse()) {
					this._changeToBool(node, false);
				} else if (left11.kind === NodeKind.BOOL && right10.kind === NodeKind.BOOL) {
					this._changeToBool(node, left11.asBool() && right10.asBool());
				}
				break;
			}

			case NodeKind.LOGICAL_OR: {
				const left12 = node.binaryLeft();
				const right11 = node.binaryRight();

				// "false || a" => "a"
				if (left12.kind === NodeKind.BOOL && left12.isFalse()) {
					node.become(right11.remove());
					this._reportCodeChange();
				}

				// Constant folding
				else if (left12.kind === NodeKind.BOOL && left12.isTrue()) {
					this._changeToBool(node, true);
				} else if (left12.kind === NodeKind.BOOL && right11.kind === NodeKind.BOOL) {
					this._changeToBool(node, left12.asBool() && right11.asBool());
				}
				break;
			}

			case NodeKind.LOGICAL_XOR: {
				const left13 = node.binaryLeft();
				const right12 = node.binaryRight();

				// Constant folding
				if (left13.kind === NodeKind.BOOL && right12.kind === NodeKind.BOOL) {
					this._changeToBool(node, left13.asBool() !== right12.asBool());
				}
				break;
			}

			case NodeKind.MULTIPLY: {
				const left14 = node.binaryLeft();
				const right13 = node.binaryRight();

				// "1 * a" => "a"
				if (left14.kind === NodeKind.INT && left14.asInt() === 1) {
					node.become(right13.remove());
					this._reportCodeChange();
				}

				// "a * 1" => "a"
				else if (right13.kind === NodeKind.INT && right13.asInt() === 1) {
					node.become(left14.remove());
					this._reportCodeChange();
				}

				// Constant folding
				else if (left14.kind === NodeKind.INT && right13.kind === NodeKind.INT) {
					this._changeToInt(node, left14.asInt() * right13.asInt());
				} else if (left14.kind === NodeKind.FLOAT && right13.kind === NodeKind.FLOAT) {
					this._changeToFloat(node, left14.asFloat() * right13.asFloat());
				}
				break;
			}

			case NodeKind.NOT_EQUAL: {
				const left15 = node.binaryLeft();
				const right14 = node.binaryRight();

				// "a != a" => "false"
				if (left15.looksTheSameAs(right14) && left15.hasNoSideEffects()) {
					this._changeToBool(node, false);
					this._reportCodeChange();
				}

				// Constant folding
				else if (left15.kind === NodeKind.INT && right14.kind === NodeKind.INT) {
					this._changeToBool(node, left15.asInt() !== right14.asInt());
				} else if (left15.kind === NodeKind.FLOAT && right14.kind === NodeKind.FLOAT) {
					this._changeToBool(node, left15.asFloat() !== right14.asFloat());
				}
				break;
			}

			case NodeKind.SUBTRACT: {
				const left16 = node.binaryLeft();
				const right15 = node.binaryRight();

				// "0 - a" => "-a"
				if (left16.isIntOrFloat(0)) {
					node.become(Node.createUnary(NodeKind.NEGATIVE, right15.remove()).withType(node.resolvedType));
					this._reportCodeChange();
				}

				// "a - 0" => "a"
				else if (right15.isIntOrFloat(0)) {
					node.become(left16.remove());
					this._reportCodeChange();
				}

				// Constant folding
				else if (left16.kind === NodeKind.INT && right15.kind === NodeKind.INT) {
					this._changeToInt(node, left16.asInt() - right15.asInt());
				} else if (left16.kind === NodeKind.FLOAT && right15.kind === NodeKind.FLOAT) {
					this._changeToFloat(node, left16.asFloat() - right15.asFloat());
				}
				break;
			}
		}
	}

	_changeToBool(node: Node, value: boolean): void {
		node.become(Node.createBool(value).withType(Type.BOOL));
		this._reportCodeChange();
	}

	_changeToFloat(node: Node, value: number): void {
		node.become(Node.createFloat(value).withType(Type.BOOL));
		this._reportCodeChange();
	}

	_changeToInt(node: Node, value: number): void {
		node.become(Node.createInt(value).withType(Type.BOOL));
		this._reportCodeChange();
	}

	_compactBlockStatement(node: Node): void {
		if (node.kind === NodeKind.BLOCK && node.hasOneChild()) {
			node.replaceWith(node.firstChild().remove());
			this._reportCodeChange();
		}
	}

	constructor() {
		this._codeWasChanged = false;
		this._variables = [];
		this._useCounts = new Map();
		this._mutationCounts = new Map();
		this._referencedExtensions = new Map();
	}
}
