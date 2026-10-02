"use client";

import {
	DsarProvider,
	LOCAL_SELF_HOST_URL,
	OperatorQueue,
	selfHosted,
} from "@dsar/react";

const backendUrl = process.env.NEXT_PUBLIC_DSAR_URL ?? LOCAL_SELF_HOST_URL;

const Page = () => (
	<DsarProvider mode={selfHosted({ url: backendUrl })}>
		<OperatorQueue />
	</DsarProvider>
);

export default Page;
