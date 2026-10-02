"use client";

import {
	DsarProvider,
	LOCAL_SELF_HOST_URL,
	SubjectPortal,
	selfHosted,
} from "@dsar/react";

const backendUrl = process.env.NEXT_PUBLIC_DSAR_URL ?? LOCAL_SELF_HOST_URL;

const Page = () => (
	<DsarProvider mode={selfHosted({ url: backendUrl })}>
		<SubjectPortal
			defaultEmail="subject@example.com"
			subjectId="subject-portal-user"
		/>
	</DsarProvider>
);

export default Page;
