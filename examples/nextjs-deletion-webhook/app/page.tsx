const HomePage = () => (
	<main>
		<h1>DSAR deletion webhook</h1>
		<p>
			POST signed events to <code>/api/webhooks/dsar</code>. Capture is
			acknowledged and does not delete anyone. Fulfilment deletes the demo user
			for <code>event.requestId</code>.
		</p>
	</main>
);

export default HomePage;
