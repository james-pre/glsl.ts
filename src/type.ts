import { StructSymbol, BaseSymbol } from './symbol.js';

export class Type {
	symbol: BaseSymbol;
	isArrayOf: Type;
	arrayCount: number;
	containsArray: boolean;
	containsSampler: boolean;
	_arrayTypes: Map<number, Type>;
	static BOOL = new StructSymbol(-1, null, 'bool', null).resolvedType();
	static BVEC2 = new StructSymbol(-2, null, 'bvec2', null).resolvedType();
	static BVEC3 = new StructSymbol(-3, null, 'bvec3', null).resolvedType();
	static BVEC4 = new StructSymbol(-4, null, 'bvec4', null).resolvedType();
	static ERROR = new StructSymbol(-5, null, '<error>', null).resolvedType();
	static FLOAT = new StructSymbol(-6, null, 'float', null).resolvedType();
	static INT = new StructSymbol(-7, null, 'int', null).resolvedType();
	static IVEC2 = new StructSymbol(-8, null, 'ivec2', null).resolvedType();
	static IVEC3 = new StructSymbol(-9, null, 'ivec3', null).resolvedType();
	static IVEC4 = new StructSymbol(-10, null, 'ivec4', null).resolvedType();
	static MAT2 = new StructSymbol(-11, null, 'mat2', null).resolvedType();
	static MAT3 = new StructSymbol(-12, null, 'mat3', null).resolvedType();
	static MAT4 = new StructSymbol(-13, null, 'mat4', null).resolvedType();
	static SAMPLER2D = new StructSymbol(-14, null, 'sampler2D', null).resolvedType()._setContainsSampler();
	static SAMPLERCUBE = new StructSymbol(-15, null, 'samplerCube', null).resolvedType()._setContainsSampler();
	static VEC2 = new StructSymbol(-16, null, 'vec2', null).resolvedType();
	static VEC3 = new StructSymbol(-17, null, 'vec3', null).resolvedType();
	static VEC4 = new StructSymbol(-18, null, 'vec4', null).resolvedType();
	static VOID = new StructSymbol(-19, null, 'void', null).resolvedType();
	static BUILT_INS: Type[] = [
		Type.BOOL,
		Type.BVEC2,
		Type.BVEC3,
		Type.BVEC4,
		Type.FLOAT,
		Type.INT,
		Type.IVEC2,
		Type.IVEC3,
		Type.IVEC4,
		Type.MAT2,
		Type.MAT3,
		Type.MAT4,
		Type.SAMPLER2D,
		Type.SAMPLERCUBE,
		Type.VEC2,
		Type.VEC3,
		Type.VEC4,
	];

	rootType(): Type {
		if (this.isArrayOf) {
			return this.isArrayOf.rootType();
		}

		return this;
	}

	// A count of "0" means an array with an unknown size
	arrayType(count: number): Type {
		console.assert(count >= 0);

		if (!this._arrayTypes) {
			this._arrayTypes = new Map();
		}

		let arrayType = this._arrayTypes.get(count);

		if (!arrayType) {
			arrayType = new Type(null, this, count);
			this._arrayTypes.set(count, arrayType);
			arrayType.containsArray = true;
			arrayType.containsSampler = this.containsSampler;
		}

		return arrayType;
	}

	toString(): string {
		if (this.isArrayOf) {
			return this.arrayCount !== 0 ? `${this.isArrayOf}[${this.arrayCount}]` : `${this.isArrayOf}[]`;
		}

		return this.symbol.name;
	}

	// For index expressions where "0 <= index < indexCount" (so indexCount == 0 means this type is un-indexable)
	indexCount(): number {
		const value: Type = this;

		if (value === Type.BVEC2 || value === Type.VEC2 || value === Type.IVEC2 || value === Type.MAT2) {
			return 2;
		} else if (value === Type.BVEC3 || value === Type.VEC3 || value === Type.IVEC3 || value === Type.MAT3) {
			return 3;
		} else if (value === Type.BVEC4 || value === Type.VEC4 || value === Type.IVEC4 || value === Type.MAT4) {
			return 4;
		} else {
			return this.arrayCount;
		}
	}

	// For index expressions
	indexType(): Type {
		const value: Type = this;

		if (value === Type.BVEC2 || value === Type.BVEC3 || value === Type.BVEC4) {
			return Type.BOOL;
		} else if (value === Type.VEC2 || value === Type.VEC3 || value === Type.VEC4) {
			return Type.FLOAT;
		} else if (value === Type.IVEC2 || value === Type.IVEC3 || value === Type.IVEC4) {
			return Type.INT;
		} else if (value === Type.MAT2) {
			return Type.VEC2;
		} else if (value === Type.MAT3) {
			return Type.VEC3;
		} else if (value === Type.MAT4) {
			return Type.VEC4;
		} else {
			return this.isArrayOf;
		}
	}

	// For constructor expressions, returns the number of required elements
	componentCount(): number {
		const value: Type = this;

		if (value === Type.BOOL || value === Type.FLOAT || value === Type.INT) {
			return 1;
		} else if (value === Type.BVEC2 || value === Type.VEC2 || value === Type.IVEC2) {
			return 2;
		} else if (value === Type.BVEC3 || value === Type.VEC3 || value === Type.IVEC3) {
			return 3;
		} else if (value === Type.BVEC4 || value === Type.VEC4 || value === Type.IVEC4 || value === Type.MAT2) {
			return 4;
		} else if (value === Type.MAT3) {
			return 9;
		} else if (value === Type.MAT4) {
			return 16;
		} else {
			return 0;
		}
	}

	// For constructor expressions, returns the base element type corresponding to componentCount
	componentType(): Type {
		const value: Type = this;

		if (value === Type.BOOL || value === Type.BVEC2 || value === Type.BVEC3 || value === Type.BVEC4) {
			return Type.BOOL;
		} else if (value === Type.FLOAT || value === Type.VEC2 || value === Type.VEC3 || value === Type.VEC4 || value === Type.MAT2 || value === Type.MAT3 || value === Type.MAT4) {
			return Type.FLOAT;
		} else if (value === Type.INT || value === Type.IVEC2 || value === Type.IVEC3 || value === Type.IVEC4) {
			return Type.INT;
		} else {
			return;
		}
	}

	// Vector types are the only ones with swizzles
	isVector(): boolean {
		const value: Type = this;

		if (
			value === Type.BVEC2 ||
			value === Type.BVEC3 ||
			value === Type.BVEC4 ||
			value === Type.IVEC2 ||
			value === Type.IVEC3 ||
			value === Type.IVEC4 ||
			value === Type.VEC2 ||
			value === Type.VEC3 ||
			value === Type.VEC4
		) {
			return true;
		} else {
			return false;
		}
	}

	isMatrix(): boolean {
		const value: Type = this;

		if (value === Type.MAT2 || value === Type.MAT3 || value === Type.MAT4) {
			return true;
		} else {
			return false;
		}
	}

	hasIntComponents(): boolean {
		const value: Type = this;

		if (value === Type.INT || value === Type.IVEC2 || value === Type.IVEC3 || value === Type.IVEC4) {
			return true;
		} else {
			return false;
		}
	}

	hasFloatComponents(): boolean {
		const value: Type = this;

		if (value === Type.FLOAT || value === Type.VEC2 || value === Type.VEC3 || value === Type.VEC4) {
			return true;
		} else if (value === Type.MAT2 || value === Type.MAT3 || value === Type.MAT4) {
			return true;
		} else {
			return false;
		}
	}

	isIntOrFloat(): boolean {
		return this.hasIntComponents() || this.hasFloatComponents();
	}

	canUseEqualityOperators(): boolean {
		return !this.containsSampler && !this.containsArray;
	}

	_setContainsSampler(): Type {
		this.containsSampler = true;
		return this;
	}

	constructor(symbol: BaseSymbol, isArrayOf: Type, arrayCount: number) {
		this.symbol = symbol;
		this.isArrayOf = isArrayOf;
		this.arrayCount = arrayCount;
		this.containsArray = false;
		this.containsSampler = false;
	}
}
