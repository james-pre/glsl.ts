import { CompilerOptions, RenameSymbols } from './compiler.js';
import { Node, NodeKind } from './node.js';
import { BaseSymbol } from './symbol.js';
import { keywords, reservedWords } from './tokenizer.js';
import { UnionFind } from './unionfind.js';
import { compare } from './utils.js';

export class Renamer {
	static _first = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_';
	static _rest = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789';
	_renameSymbols: RenameSymbols;
	_functionList: Array<Renamer.SymbolInfo>;
	_symbolInfoList: Array<Renamer.SymbolInfo>;
	_symbolInfoMap: Map<number, Renamer.SymbolInfo>;
	_localVariableUnionFind: UnionFind;
	_namingGroupsUnionFind: UnionFind;
	_globalIndex: number;
	_nextSymbolName: number;
	_enclosingFunctionLabel: number;

	static rename(globals: Node[], options: CompilerOptions): Map<string, string> {
		return new Renamer(options.renamingSymbols)._rename(globals);
	}

	static _numberToName(number: number): string {
		let name = Renamer._first[number % Renamer._first.length];
		number = (number / Renamer._first.length) | 0;

		while (number > 0) {
			number = number - 1;
			name += Renamer._rest[number % Renamer._rest.length];
			number = (number / Renamer._rest.length) | 0;
		}

		return name;
	}

	_rename(globals: Node[]): Map<string, string> {
		// Gather information
		for (let i = 0, count = globals.length; i < count; i++) {
			this._globalIndex = i;
			this._scanForSymbols(globals[i]);
		}

		// Compact names of unrelated things
		this._aliasArgumentAndLocalVariablesFromDifferentFunctions();

		// Do the renaming
		const renaming = new Map();
		const groups = this._extractGroups(this._namingGroupsUnionFind, null);
		groups.sort((a: Array<Renamer.SymbolInfo>, b: Array<Renamer.SymbolInfo>) => {
			return compare(this._countUses(b), this._countUses(a));
		});

		for (const group of groups) {
			let name: string = null;

			for (const info of group) {
				for (const symbol of Array.from(info.symbols.values())) {
					const old = symbol.name;

					if (!symbol.isImportedOrExported() && (this._renameSymbols === 'all' || (this._renameSymbols === 'internal-only' && !symbol.isAttributeOrUniform()))) {
						if (name === null) {
							name = this._generateSymbolName();
						}

						symbol.name = name;
					}

					if (!symbol.isImported() && symbol.isAttributeOrUniform()) {
						renaming.set(old, symbol.name);
					}
				}
			}
		}

		return renaming;
	}

	_scanForSymbols(node: Node): void {
		let ref1: Renamer.SymbolInfo;
		let ref: Renamer.SymbolInfo;

		if (node.symbol !== null) {
			(ref = this._recordSymbol(node.symbol)).useCount = ref.useCount + 1;
		}

		for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
			this._scanForSymbols(child);
		}

		switch (node.kind) {
			case NodeKind.VARIABLE: {
				const variable = node.symbol.asVariable();
				this._scanForSymbols(variable.type);

				if (variable.value() !== null) {
					this._scanForSymbols(variable.value());
				}
				break;
			}

			case NodeKind.FUNCTION: {
				console.assert(this._symbolInfoMap.has(node.symbol.id)); // Should be added from _recordSymbol() above
				const _function = node.symbol.asFunction();
				this._enclosingFunctionLabel = this._symbolInfoMap.get(node.symbol.id).label;

				if (_function.sibling !== null) {
					this._namingGroupsUnionFind.union(this._enclosingFunctionLabel, this._recordSymbol(_function.sibling as BaseSymbol).label);
				}

				this._scanForSymbols(_function.returnType);

				for (const argument of _function._arguments) {
					(ref1 = this._recordSymbol(argument as BaseSymbol)).useCount = ref1.useCount + 1;
					this._scanForSymbols(argument.type);
				}

				if (_function.block !== null) {
					this._scanForSymbols(_function.block);
				}

				this._enclosingFunctionLabel = -1;
				break;
			}
		}
	}

	_recordSymbol(symbol: BaseSymbol): Renamer.SymbolInfo {
		let info = this._symbolInfoMap.get(symbol.id);

		if (!info) {
			info = new Renamer.SymbolInfo(symbol.name, this._symbolInfoList.length);
			info.isArgumentOrLocalVariable = symbol.isArgumentOrLocalVariable();
			this._symbolInfoList.push(info);
			this._symbolInfoMap.set(symbol.id, info);
			this._localVariableUnionFind.allocate1();
			this._namingGroupsUnionFind.allocate1();
		}

		if (!info.symbols.has(this._globalIndex)) {
			info.symbols.set(this._globalIndex, symbol);
		}

		if (symbol.isArgumentOrLocalVariable()) {
			this._localVariableUnionFind.union(this._enclosingFunctionLabel, info.label);
		}

		return info;
	}

	_generateSymbolName(): string {
		while (true) {
			const name = Renamer._numberToName(this._nextSymbolName);
			this._nextSymbolName = this._nextSymbolName + 1;

			if (keywords.has(name) || reservedWords.has(name) || name.startsWith('gl_')) {
				continue;
			}

			return name;
		}
	}

	_extractGroups(unionFind: UnionFind, filter: (v0: Renamer.SymbolInfo) => boolean): Array<Array<Renamer.SymbolInfo>> {
		const labelToGroup = new Map();

		for (const info of this._symbolInfoList) {
			if (filter !== null && !filter(info)) {
				continue;
			}

			const label = unionFind.find(info.label);
			let group = labelToGroup.get(label);

			if (!group) {
				group = [];
				labelToGroup.set(label, group);
			}

			group.push(info);
		}

		return Array.from(labelToGroup.values());
	}

	_aliasArgumentAndLocalVariablesFromDifferentFunctions(): void {
		this._zipTogetherInOrder(
			this._extractGroups(this._localVariableUnionFind, (info: Renamer.SymbolInfo) => {
				return info.isArgumentOrLocalVariable;
			})
		);
	}

	_zipTogetherInOrder(groups: Array<Array<Renamer.SymbolInfo>>): void {
		const labels: number[] = [];

		for (const group of groups) {
			group.sort((a: Renamer.SymbolInfo, b: Renamer.SymbolInfo) => {
				return compare(b.useCount, a.useCount);
			});

			for (let i = 0, count = group.length; i < count; i++) {
				const info = group[i];

				if (i < labels.length) {
					this._namingGroupsUnionFind.union(info.label, labels[i]);
				} else {
					labels.push(info.label);
				}
			}
		}
	}

	_countUses(group: Array<Renamer.SymbolInfo>): number {
		let total = 0;

		for (const info of group) {
			total = total + info.useCount;
		}

		return total;
	}

	constructor(_renameSymbols: RenameSymbols) {
		this._renameSymbols = _renameSymbols;
		this._functionList = [];
		this._symbolInfoList = [];
		this._symbolInfoMap = new Map();
		this._localVariableUnionFind = new UnionFind();
		this._namingGroupsUnionFind = new UnionFind();
		this._globalIndex = 0;
		this._nextSymbolName = 0;
		this._enclosingFunctionLabel = -1;
	}
}

export namespace Renamer {
	export class SymbolInfo {
		name: string;
		label: number;

		symbols: Map<number, BaseSymbol>; // One from each duplicate shader compilation
		useCount: number;
		isArgumentOrLocalVariable: boolean;

		constructor(name: string, label: number) {
			this.name = name;
			this.label = label;
			this.symbols = new Map();
			this.useCount = 0;
			this.isArgumentOrLocalVariable = false;
		}
	}
}
