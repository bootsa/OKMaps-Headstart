declare module "*.png" {
	const src: string;
	export default src;
}

declare module "*.csl?raw" {
	const text: string;
	export default text;
}
