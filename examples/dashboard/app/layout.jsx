import "@dsar/react/styles.css";

const RootLayout = ({ children }) => (
	<html lang="en">
		<body className="dsar-page">
			<header className="dsar-page-header">
				<strong>DSAR</strong>
				<span>Operator queue</span>
			</header>
			{children}
		</body>
	</html>
);

export default RootLayout;
