import type { S3ClientConfig } from "@aws-sdk/client-s3";
import * as Layer from "effect/Layer";

import * as s3 from "./s3.js";

// *****  GENERATED CODE *****
export { s3 };

export const AllClientsDefault = Layer.mergeAll(s3.S3Client.Default());

export const makeClients = (config?: { s3?: S3ClientConfig }) =>
	Layer.mergeAll(s3.S3Client.Default(config?.s3));
