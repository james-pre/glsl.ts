import { Type } from './type.js';

export function strings(componentCount: number): Array<string> {
	switch (componentCount) {
		case 2: {
			return _STRINGS_2;
		}

		case 3: {
			return _STRINGS_3;
		}

		case 4: {
			return _STRINGS_4;
		}
	}

	console.assert(false);
	return null;
}

export function type(comonentType: Type, componentCount: number): Type {
	const value = comonentType;

	if (value === Type.BOOL) {
		switch (componentCount) {
			case 1: {
				return Type.BOOL;
			}

			case 2: {
				return Type.BVEC2;
			}

			case 3: {
				return Type.BVEC3;
			}

			case 4: {
				return Type.BVEC4;
			}
		}
	} else if (value === Type.FLOAT) {
		switch (componentCount) {
			case 1: {
				return Type.FLOAT;
			}

			case 2: {
				return Type.VEC2;
			}

			case 3: {
				return Type.VEC3;
			}

			case 4: {
				return Type.VEC4;
			}
		}
	} else if (value === Type.INT) {
		switch (componentCount) {
			case 1: {
				return Type.INT;
			}

			case 2: {
				return Type.IVEC2;
			}

			case 3: {
				return Type.IVEC3;
			}

			case 4: {
				return Type.IVEC4;
			}
		}
	}

	console.assert(false);
	return null;
}

export const _STRINGS_2: Array<string> = ['xy', 'st', 'rg'];
export const _STRINGS_3: Array<string> = ['xyz', 'stp', 'rgb'];
export const _STRINGS_4: Array<string> = ['xyzw', 'stpq', 'rgba'];
