import type { ReactNode } from "react";

const RootLayout = (props: { readonly children: ReactNode }) => (
	<html lang="en">
		<body>{props.children}</body>
	</html>
);

export default RootLayout;
