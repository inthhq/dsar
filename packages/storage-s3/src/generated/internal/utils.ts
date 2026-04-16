/* oxlint-disable @typescript-eslint/ban-types, @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any */
// *****  GENERATED CODE *****

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
	k: infer I
) => void
	? I
	: never;

export type AllErrors<
	Api extends Record<
		string,
		[unknown, unknown, Record<string, unknown> | never]
	>,
> =
	UnionToIntersection<
		{
			[C in keyof Api]: Api[C][2] extends never
				? {}
				: {
						[E in keyof Api[C][2]]: Api[C][2][E];
					};
		}[keyof Api]
	> extends infer I
		? { [K in keyof I]: I[K] }
		: never;
