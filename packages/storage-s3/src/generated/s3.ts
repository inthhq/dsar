/* oxlint-disable eqeqeq, max-classes-per-file, no-shadow, require-yield, @typescript-eslint/no-use-before-define, @typescript-eslint/parameter-properties */
import * as Sdk from "@aws-sdk/client-s3";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/ServiceMap";

// *****  GENERATED CODE *****

export class S3Client extends ServiceMap.Service<S3Client, Sdk.S3Client>()(
	"S3Client"
) {
	static Default = (config?: Sdk.S3ClientConfig) =>
		Layer.effect(S3Client)(
			Effect.gen(function* Default() {
				return new Sdk.S3Client(config ?? {});
			})
		);
}

/**
 * Creates an Effect that executes an AWS S3 command.
 *
 * @param actionName - The name of the S3 command to execute
 * @param actionInput - The input parameters for the command
 * @returns An Effect that will execute the command and return its output
 *
 * @example
 * ```typescript
 * import { s3 } from "@effect-ak/aws-sdk"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* s3.make("command_name", {
 *     // command input parameters
 *   })
 *   return result
 * })
 * ```
 */
export const make = Effect.fn("aws_S3")(function* make<M extends keyof S3Api>(
	actionName: M,
	actionInput: S3Api[M][0]
) {
	yield* Effect.logDebug(`aws_S3.${actionName}`, { input: actionInput });

	const client = yield* S3Client;
	const command = new S3CommandFactory[actionName](actionInput) as Parameters<
		typeof client.send
	>[0];

	const result = yield* Effect.tryPromise({
		catch: (error) => {
			if (error instanceof Sdk.S3ServiceException) {
				return new S3Error(error, actionName);
			}
			throw error;
		},
		try: () => client.send(command) as Promise<S3Api[M][1]>,
	});

	yield* Effect.logDebug(`aws_S3.${actionName} completed`);

	return result;
});

export class S3Error<C extends keyof S3Api> {
	readonly _tag = "S3Error";

	constructor(
		readonly cause: Sdk.S3ServiceException,
		readonly command: C
	) {}

	$is<N extends keyof S3Api[C][2]>(name: N): this is S3Error<C> {
		return this.cause.name == name;
	}

	is(name: string): this is S3Error<C> {
		return this.cause.name == name;
	}
}

export type S3MethodInput<M extends keyof S3Api> = S3Api[M][0];
interface S3Api {
	abort_multipart_upload: [
		Sdk.AbortMultipartUploadCommandInput,
		Sdk.AbortMultipartUploadCommandOutput,
		{
			NoSuchUpload: Sdk.NoSuchUpload;
		},
	];
	complete_multipart_upload: [
		Sdk.CompleteMultipartUploadCommandInput,
		Sdk.CompleteMultipartUploadCommandOutput,
		never,
	];
	copy_object: [
		Sdk.CopyObjectCommandInput,
		Sdk.CopyObjectCommandOutput,
		{
			ObjectNotInActiveTierError: Sdk.ObjectNotInActiveTierError;
		},
	];
	create_bucket: [
		Sdk.CreateBucketCommandInput,
		Sdk.CreateBucketCommandOutput,
		{
			BucketAlreadyExists: Sdk.BucketAlreadyExists;
			BucketAlreadyOwnedByYou: Sdk.BucketAlreadyOwnedByYou;
		},
	];
	create_bucket_metadata_configuration: [
		Sdk.CreateBucketMetadataConfigurationCommandInput,
		Sdk.CreateBucketMetadataConfigurationCommandOutput,
		never,
	];
	create_bucket_metadata_table_configuration: [
		Sdk.CreateBucketMetadataTableConfigurationCommandInput,
		Sdk.CreateBucketMetadataTableConfigurationCommandOutput,
		never,
	];
	create_multipart_upload: [
		Sdk.CreateMultipartUploadCommandInput,
		Sdk.CreateMultipartUploadCommandOutput,
		never,
	];
	create_session: [
		Sdk.CreateSessionCommandInput,
		Sdk.CreateSessionCommandOutput,
		{
			NoSuchBucket: Sdk.NoSuchBucket;
		},
	];
	delete_bucket: [
		Sdk.DeleteBucketCommandInput,
		Sdk.DeleteBucketCommandOutput,
		never,
	];
	delete_bucket_analytics_configuration: [
		Sdk.DeleteBucketAnalyticsConfigurationCommandInput,
		Sdk.DeleteBucketAnalyticsConfigurationCommandOutput,
		never,
	];
	delete_bucket_cors: [
		Sdk.DeleteBucketCorsCommandInput,
		Sdk.DeleteBucketCorsCommandOutput,
		never,
	];
	delete_bucket_encryption: [
		Sdk.DeleteBucketEncryptionCommandInput,
		Sdk.DeleteBucketEncryptionCommandOutput,
		never,
	];
	delete_bucket_intelligent_tiering_configuration: [
		Sdk.DeleteBucketIntelligentTieringConfigurationCommandInput,
		Sdk.DeleteBucketIntelligentTieringConfigurationCommandOutput,
		never,
	];
	delete_bucket_inventory_configuration: [
		Sdk.DeleteBucketInventoryConfigurationCommandInput,
		Sdk.DeleteBucketInventoryConfigurationCommandOutput,
		never,
	];
	delete_bucket_lifecycle: [
		Sdk.DeleteBucketLifecycleCommandInput,
		Sdk.DeleteBucketLifecycleCommandOutput,
		never,
	];
	delete_bucket_metadata_configuration: [
		Sdk.DeleteBucketMetadataConfigurationCommandInput,
		Sdk.DeleteBucketMetadataConfigurationCommandOutput,
		never,
	];
	delete_bucket_metadata_table_configuration: [
		Sdk.DeleteBucketMetadataTableConfigurationCommandInput,
		Sdk.DeleteBucketMetadataTableConfigurationCommandOutput,
		never,
	];
	delete_bucket_metrics_configuration: [
		Sdk.DeleteBucketMetricsConfigurationCommandInput,
		Sdk.DeleteBucketMetricsConfigurationCommandOutput,
		never,
	];
	delete_bucket_ownership_controls: [
		Sdk.DeleteBucketOwnershipControlsCommandInput,
		Sdk.DeleteBucketOwnershipControlsCommandOutput,
		never,
	];
	delete_bucket_policy: [
		Sdk.DeleteBucketPolicyCommandInput,
		Sdk.DeleteBucketPolicyCommandOutput,
		never,
	];
	delete_bucket_replication: [
		Sdk.DeleteBucketReplicationCommandInput,
		Sdk.DeleteBucketReplicationCommandOutput,
		never,
	];
	delete_bucket_tagging: [
		Sdk.DeleteBucketTaggingCommandInput,
		Sdk.DeleteBucketTaggingCommandOutput,
		never,
	];
	delete_bucket_website: [
		Sdk.DeleteBucketWebsiteCommandInput,
		Sdk.DeleteBucketWebsiteCommandOutput,
		never,
	];
	delete_object: [
		Sdk.DeleteObjectCommandInput,
		Sdk.DeleteObjectCommandOutput,
		never,
	];
	delete_object_tagging: [
		Sdk.DeleteObjectTaggingCommandInput,
		Sdk.DeleteObjectTaggingCommandOutput,
		never,
	];
	delete_objects: [
		Sdk.DeleteObjectsCommandInput,
		Sdk.DeleteObjectsCommandOutput,
		never,
	];
	delete_public_access_block: [
		Sdk.DeletePublicAccessBlockCommandInput,
		Sdk.DeletePublicAccessBlockCommandOutput,
		never,
	];
	get_bucket_abac: [
		Sdk.GetBucketAbacCommandInput,
		Sdk.GetBucketAbacCommandOutput,
		never,
	];
	get_bucket_accelerate_configuration: [
		Sdk.GetBucketAccelerateConfigurationCommandInput,
		Sdk.GetBucketAccelerateConfigurationCommandOutput,
		never,
	];
	get_bucket_acl: [
		Sdk.GetBucketAclCommandInput,
		Sdk.GetBucketAclCommandOutput,
		never,
	];
	get_bucket_analytics_configuration: [
		Sdk.GetBucketAnalyticsConfigurationCommandInput,
		Sdk.GetBucketAnalyticsConfigurationCommandOutput,
		never,
	];
	get_bucket_cors: [
		Sdk.GetBucketCorsCommandInput,
		Sdk.GetBucketCorsCommandOutput,
		never,
	];
	get_bucket_encryption: [
		Sdk.GetBucketEncryptionCommandInput,
		Sdk.GetBucketEncryptionCommandOutput,
		never,
	];
	get_bucket_intelligent_tiering_configuration: [
		Sdk.GetBucketIntelligentTieringConfigurationCommandInput,
		Sdk.GetBucketIntelligentTieringConfigurationCommandOutput,
		never,
	];
	get_bucket_inventory_configuration: [
		Sdk.GetBucketInventoryConfigurationCommandInput,
		Sdk.GetBucketInventoryConfigurationCommandOutput,
		never,
	];
	get_bucket_lifecycle_configuration: [
		Sdk.GetBucketLifecycleConfigurationCommandInput,
		Sdk.GetBucketLifecycleConfigurationCommandOutput,
		never,
	];
	get_bucket_location: [
		Sdk.GetBucketLocationCommandInput,
		Sdk.GetBucketLocationCommandOutput,
		never,
	];
	get_bucket_logging: [
		Sdk.GetBucketLoggingCommandInput,
		Sdk.GetBucketLoggingCommandOutput,
		never,
	];
	get_bucket_metadata_configuration: [
		Sdk.GetBucketMetadataConfigurationCommandInput,
		Sdk.GetBucketMetadataConfigurationCommandOutput,
		never,
	];
	get_bucket_metadata_table_configuration: [
		Sdk.GetBucketMetadataTableConfigurationCommandInput,
		Sdk.GetBucketMetadataTableConfigurationCommandOutput,
		never,
	];
	get_bucket_metrics_configuration: [
		Sdk.GetBucketMetricsConfigurationCommandInput,
		Sdk.GetBucketMetricsConfigurationCommandOutput,
		never,
	];
	get_bucket_notification_configuration: [
		Sdk.GetBucketNotificationConfigurationCommandInput,
		Sdk.GetBucketNotificationConfigurationCommandOutput,
		never,
	];
	get_bucket_ownership_controls: [
		Sdk.GetBucketOwnershipControlsCommandInput,
		Sdk.GetBucketOwnershipControlsCommandOutput,
		never,
	];
	get_bucket_policy: [
		Sdk.GetBucketPolicyCommandInput,
		Sdk.GetBucketPolicyCommandOutput,
		never,
	];
	get_bucket_policy_status: [
		Sdk.GetBucketPolicyStatusCommandInput,
		Sdk.GetBucketPolicyStatusCommandOutput,
		never,
	];
	get_bucket_replication: [
		Sdk.GetBucketReplicationCommandInput,
		Sdk.GetBucketReplicationCommandOutput,
		never,
	];
	get_bucket_request_payment: [
		Sdk.GetBucketRequestPaymentCommandInput,
		Sdk.GetBucketRequestPaymentCommandOutput,
		never,
	];
	get_bucket_tagging: [
		Sdk.GetBucketTaggingCommandInput,
		Sdk.GetBucketTaggingCommandOutput,
		never,
	];
	get_bucket_versioning: [
		Sdk.GetBucketVersioningCommandInput,
		Sdk.GetBucketVersioningCommandOutput,
		never,
	];
	get_bucket_website: [
		Sdk.GetBucketWebsiteCommandInput,
		Sdk.GetBucketWebsiteCommandOutput,
		never,
	];
	get_object: [
		Sdk.GetObjectCommandInput,
		Sdk.GetObjectCommandOutput,
		{
			InvalidObjectState: Sdk.InvalidObjectState;
			NoSuchKey: Sdk.NoSuchKey;
		},
	];
	get_object_acl: [
		Sdk.GetObjectAclCommandInput,
		Sdk.GetObjectAclCommandOutput,
		{
			NoSuchKey: Sdk.NoSuchKey;
		},
	];
	get_object_attributes: [
		Sdk.GetObjectAttributesCommandInput,
		Sdk.GetObjectAttributesCommandOutput,
		{
			NoSuchKey: Sdk.NoSuchKey;
		},
	];
	get_object_legal_hold: [
		Sdk.GetObjectLegalHoldCommandInput,
		Sdk.GetObjectLegalHoldCommandOutput,
		never,
	];
	get_object_lock_configuration: [
		Sdk.GetObjectLockConfigurationCommandInput,
		Sdk.GetObjectLockConfigurationCommandOutput,
		never,
	];
	get_object_retention: [
		Sdk.GetObjectRetentionCommandInput,
		Sdk.GetObjectRetentionCommandOutput,
		never,
	];
	get_object_tagging: [
		Sdk.GetObjectTaggingCommandInput,
		Sdk.GetObjectTaggingCommandOutput,
		never,
	];
	get_object_torrent: [
		Sdk.GetObjectTorrentCommandInput,
		Sdk.GetObjectTorrentCommandOutput,
		never,
	];
	get_public_access_block: [
		Sdk.GetPublicAccessBlockCommandInput,
		Sdk.GetPublicAccessBlockCommandOutput,
		never,
	];
	head_bucket: [
		Sdk.HeadBucketCommandInput,
		Sdk.HeadBucketCommandOutput,
		{
			NotFound: Sdk.NotFound;
		},
	];
	head_object: [
		Sdk.HeadObjectCommandInput,
		Sdk.HeadObjectCommandOutput,
		{
			NotFound: Sdk.NotFound;
		},
	];
	list_bucket_analytics_configurations: [
		Sdk.ListBucketAnalyticsConfigurationsCommandInput,
		Sdk.ListBucketAnalyticsConfigurationsCommandOutput,
		never,
	];
	list_bucket_intelligent_tiering_configurations: [
		Sdk.ListBucketIntelligentTieringConfigurationsCommandInput,
		Sdk.ListBucketIntelligentTieringConfigurationsCommandOutput,
		never,
	];
	list_bucket_inventory_configurations: [
		Sdk.ListBucketInventoryConfigurationsCommandInput,
		Sdk.ListBucketInventoryConfigurationsCommandOutput,
		never,
	];
	list_bucket_metrics_configurations: [
		Sdk.ListBucketMetricsConfigurationsCommandInput,
		Sdk.ListBucketMetricsConfigurationsCommandOutput,
		never,
	];
	list_buckets: [
		Sdk.ListBucketsCommandInput,
		Sdk.ListBucketsCommandOutput,
		never,
	];
	list_directory_buckets: [
		Sdk.ListDirectoryBucketsCommandInput,
		Sdk.ListDirectoryBucketsCommandOutput,
		never,
	];
	list_multipart_uploads: [
		Sdk.ListMultipartUploadsCommandInput,
		Sdk.ListMultipartUploadsCommandOutput,
		never,
	];
	list_object_versions: [
		Sdk.ListObjectVersionsCommandInput,
		Sdk.ListObjectVersionsCommandOutput,
		never,
	];
	list_objects: [
		Sdk.ListObjectsCommandInput,
		Sdk.ListObjectsCommandOutput,
		{
			NoSuchBucket: Sdk.NoSuchBucket;
		},
	];
	list_objects_v2: [
		Sdk.ListObjectsV2CommandInput,
		Sdk.ListObjectsV2CommandOutput,
		{
			NoSuchBucket: Sdk.NoSuchBucket;
		},
	];
	list_parts: [Sdk.ListPartsCommandInput, Sdk.ListPartsCommandOutput, never];
	put_bucket_abac: [
		Sdk.PutBucketAbacCommandInput,
		Sdk.PutBucketAbacCommandOutput,
		never,
	];
	put_bucket_accelerate_configuration: [
		Sdk.PutBucketAccelerateConfigurationCommandInput,
		Sdk.PutBucketAccelerateConfigurationCommandOutput,
		never,
	];
	put_bucket_acl: [
		Sdk.PutBucketAclCommandInput,
		Sdk.PutBucketAclCommandOutput,
		never,
	];
	put_bucket_analytics_configuration: [
		Sdk.PutBucketAnalyticsConfigurationCommandInput,
		Sdk.PutBucketAnalyticsConfigurationCommandOutput,
		never,
	];
	put_bucket_cors: [
		Sdk.PutBucketCorsCommandInput,
		Sdk.PutBucketCorsCommandOutput,
		never,
	];
	put_bucket_encryption: [
		Sdk.PutBucketEncryptionCommandInput,
		Sdk.PutBucketEncryptionCommandOutput,
		never,
	];
	put_bucket_intelligent_tiering_configuration: [
		Sdk.PutBucketIntelligentTieringConfigurationCommandInput,
		Sdk.PutBucketIntelligentTieringConfigurationCommandOutput,
		never,
	];
	put_bucket_inventory_configuration: [
		Sdk.PutBucketInventoryConfigurationCommandInput,
		Sdk.PutBucketInventoryConfigurationCommandOutput,
		never,
	];
	put_bucket_lifecycle_configuration: [
		Sdk.PutBucketLifecycleConfigurationCommandInput,
		Sdk.PutBucketLifecycleConfigurationCommandOutput,
		never,
	];
	put_bucket_logging: [
		Sdk.PutBucketLoggingCommandInput,
		Sdk.PutBucketLoggingCommandOutput,
		never,
	];
	put_bucket_metrics_configuration: [
		Sdk.PutBucketMetricsConfigurationCommandInput,
		Sdk.PutBucketMetricsConfigurationCommandOutput,
		never,
	];
	put_bucket_notification_configuration: [
		Sdk.PutBucketNotificationConfigurationCommandInput,
		Sdk.PutBucketNotificationConfigurationCommandOutput,
		never,
	];
	put_bucket_ownership_controls: [
		Sdk.PutBucketOwnershipControlsCommandInput,
		Sdk.PutBucketOwnershipControlsCommandOutput,
		never,
	];
	put_bucket_policy: [
		Sdk.PutBucketPolicyCommandInput,
		Sdk.PutBucketPolicyCommandOutput,
		never,
	];
	put_bucket_replication: [
		Sdk.PutBucketReplicationCommandInput,
		Sdk.PutBucketReplicationCommandOutput,
		never,
	];
	put_bucket_request_payment: [
		Sdk.PutBucketRequestPaymentCommandInput,
		Sdk.PutBucketRequestPaymentCommandOutput,
		never,
	];
	put_bucket_tagging: [
		Sdk.PutBucketTaggingCommandInput,
		Sdk.PutBucketTaggingCommandOutput,
		never,
	];
	put_bucket_versioning: [
		Sdk.PutBucketVersioningCommandInput,
		Sdk.PutBucketVersioningCommandOutput,
		never,
	];
	put_bucket_website: [
		Sdk.PutBucketWebsiteCommandInput,
		Sdk.PutBucketWebsiteCommandOutput,
		never,
	];
	put_object: [
		Sdk.PutObjectCommandInput,
		Sdk.PutObjectCommandOutput,
		{
			EncryptionTypeMismatch: Sdk.EncryptionTypeMismatch;
			InvalidRequest: Sdk.InvalidRequest;
			InvalidWriteOffset: Sdk.InvalidWriteOffset;
			TooManyParts: Sdk.TooManyParts;
		},
	];
	put_object_acl: [
		Sdk.PutObjectAclCommandInput,
		Sdk.PutObjectAclCommandOutput,
		{
			NoSuchKey: Sdk.NoSuchKey;
		},
	];
	put_object_legal_hold: [
		Sdk.PutObjectLegalHoldCommandInput,
		Sdk.PutObjectLegalHoldCommandOutput,
		never,
	];
	put_object_lock_configuration: [
		Sdk.PutObjectLockConfigurationCommandInput,
		Sdk.PutObjectLockConfigurationCommandOutput,
		never,
	];
	put_object_retention: [
		Sdk.PutObjectRetentionCommandInput,
		Sdk.PutObjectRetentionCommandOutput,
		never,
	];
	put_object_tagging: [
		Sdk.PutObjectTaggingCommandInput,
		Sdk.PutObjectTaggingCommandOutput,
		never,
	];
	put_public_access_block: [
		Sdk.PutPublicAccessBlockCommandInput,
		Sdk.PutPublicAccessBlockCommandOutput,
		never,
	];
	rename_object: [
		Sdk.RenameObjectCommandInput,
		Sdk.RenameObjectCommandOutput,
		{
			IdempotencyParameterMismatch: Sdk.IdempotencyParameterMismatch;
		},
	];
	restore_object: [
		Sdk.RestoreObjectCommandInput,
		Sdk.RestoreObjectCommandOutput,
		{
			ObjectAlreadyInActiveTierError: Sdk.ObjectAlreadyInActiveTierError;
		},
	];
	select_object_content: [
		Sdk.SelectObjectContentCommandInput,
		Sdk.SelectObjectContentCommandOutput,
		never,
	];
	update_bucket_metadata_inventory_table_configuration: [
		Sdk.UpdateBucketMetadataInventoryTableConfigurationCommandInput,
		Sdk.UpdateBucketMetadataInventoryTableConfigurationCommandOutput,
		never,
	];
	update_bucket_metadata_journal_table_configuration: [
		Sdk.UpdateBucketMetadataJournalTableConfigurationCommandInput,
		Sdk.UpdateBucketMetadataJournalTableConfigurationCommandOutput,
		never,
	];
	update_object_encryption: [
		Sdk.UpdateObjectEncryptionCommandInput,
		Sdk.UpdateObjectEncryptionCommandOutput,
		{
			AccessDenied: Sdk.AccessDenied;
			InvalidRequest: Sdk.InvalidRequest;
			NoSuchKey: Sdk.NoSuchKey;
		},
	];
	upload_part: [Sdk.UploadPartCommandInput, Sdk.UploadPartCommandOutput, never];
	upload_part_copy: [
		Sdk.UploadPartCopyCommandInput,
		Sdk.UploadPartCopyCommandOutput,
		never,
	];
	write_get_object_response: [
		Sdk.WriteGetObjectResponseCommandInput,
		Sdk.WriteGetObjectResponseCommandOutput,
		never,
	];
}

const S3CommandFactory: {
	[M in keyof S3Api]: new (args: S3Api[M][0]) => unknown;
} = {
	abort_multipart_upload: Sdk.AbortMultipartUploadCommand,
	complete_multipart_upload: Sdk.CompleteMultipartUploadCommand,
	copy_object: Sdk.CopyObjectCommand,
	create_bucket: Sdk.CreateBucketCommand,
	create_bucket_metadata_configuration:
		Sdk.CreateBucketMetadataConfigurationCommand,
	create_bucket_metadata_table_configuration:
		Sdk.CreateBucketMetadataTableConfigurationCommand,
	create_multipart_upload: Sdk.CreateMultipartUploadCommand,
	create_session: Sdk.CreateSessionCommand,
	delete_bucket: Sdk.DeleteBucketCommand,
	delete_bucket_analytics_configuration:
		Sdk.DeleteBucketAnalyticsConfigurationCommand,
	delete_bucket_cors: Sdk.DeleteBucketCorsCommand,
	delete_bucket_encryption: Sdk.DeleteBucketEncryptionCommand,
	delete_bucket_intelligent_tiering_configuration:
		Sdk.DeleteBucketIntelligentTieringConfigurationCommand,
	delete_bucket_inventory_configuration:
		Sdk.DeleteBucketInventoryConfigurationCommand,
	delete_bucket_lifecycle: Sdk.DeleteBucketLifecycleCommand,
	delete_bucket_metadata_configuration:
		Sdk.DeleteBucketMetadataConfigurationCommand,
	delete_bucket_metadata_table_configuration:
		Sdk.DeleteBucketMetadataTableConfigurationCommand,
	delete_bucket_metrics_configuration:
		Sdk.DeleteBucketMetricsConfigurationCommand,
	delete_bucket_ownership_controls: Sdk.DeleteBucketOwnershipControlsCommand,
	delete_bucket_policy: Sdk.DeleteBucketPolicyCommand,
	delete_bucket_replication: Sdk.DeleteBucketReplicationCommand,
	delete_bucket_tagging: Sdk.DeleteBucketTaggingCommand,
	delete_bucket_website: Sdk.DeleteBucketWebsiteCommand,
	delete_object: Sdk.DeleteObjectCommand,
	delete_object_tagging: Sdk.DeleteObjectTaggingCommand,
	delete_objects: Sdk.DeleteObjectsCommand,
	delete_public_access_block: Sdk.DeletePublicAccessBlockCommand,
	get_bucket_abac: Sdk.GetBucketAbacCommand,
	get_bucket_accelerate_configuration:
		Sdk.GetBucketAccelerateConfigurationCommand,
	get_bucket_acl: Sdk.GetBucketAclCommand,
	get_bucket_analytics_configuration:
		Sdk.GetBucketAnalyticsConfigurationCommand,
	get_bucket_cors: Sdk.GetBucketCorsCommand,
	get_bucket_encryption: Sdk.GetBucketEncryptionCommand,
	get_bucket_intelligent_tiering_configuration:
		Sdk.GetBucketIntelligentTieringConfigurationCommand,
	get_bucket_inventory_configuration:
		Sdk.GetBucketInventoryConfigurationCommand,
	get_bucket_lifecycle_configuration:
		Sdk.GetBucketLifecycleConfigurationCommand,
	get_bucket_location: Sdk.GetBucketLocationCommand,
	get_bucket_logging: Sdk.GetBucketLoggingCommand,
	get_bucket_metadata_configuration: Sdk.GetBucketMetadataConfigurationCommand,
	get_bucket_metadata_table_configuration:
		Sdk.GetBucketMetadataTableConfigurationCommand,
	get_bucket_metrics_configuration: Sdk.GetBucketMetricsConfigurationCommand,
	get_bucket_notification_configuration:
		Sdk.GetBucketNotificationConfigurationCommand,
	get_bucket_ownership_controls: Sdk.GetBucketOwnershipControlsCommand,
	get_bucket_policy: Sdk.GetBucketPolicyCommand,
	get_bucket_policy_status: Sdk.GetBucketPolicyStatusCommand,
	get_bucket_replication: Sdk.GetBucketReplicationCommand,
	get_bucket_request_payment: Sdk.GetBucketRequestPaymentCommand,
	get_bucket_tagging: Sdk.GetBucketTaggingCommand,
	get_bucket_versioning: Sdk.GetBucketVersioningCommand,
	get_bucket_website: Sdk.GetBucketWebsiteCommand,
	get_object: Sdk.GetObjectCommand,
	get_object_acl: Sdk.GetObjectAclCommand,
	get_object_attributes: Sdk.GetObjectAttributesCommand,
	get_object_legal_hold: Sdk.GetObjectLegalHoldCommand,
	get_object_lock_configuration: Sdk.GetObjectLockConfigurationCommand,
	get_object_retention: Sdk.GetObjectRetentionCommand,
	get_object_tagging: Sdk.GetObjectTaggingCommand,
	get_object_torrent: Sdk.GetObjectTorrentCommand,
	get_public_access_block: Sdk.GetPublicAccessBlockCommand,
	head_bucket: Sdk.HeadBucketCommand,
	head_object: Sdk.HeadObjectCommand,
	list_bucket_analytics_configurations:
		Sdk.ListBucketAnalyticsConfigurationsCommand,
	list_bucket_intelligent_tiering_configurations:
		Sdk.ListBucketIntelligentTieringConfigurationsCommand,
	list_bucket_inventory_configurations:
		Sdk.ListBucketInventoryConfigurationsCommand,
	list_bucket_metrics_configurations:
		Sdk.ListBucketMetricsConfigurationsCommand,
	list_buckets: Sdk.ListBucketsCommand,
	list_directory_buckets: Sdk.ListDirectoryBucketsCommand,
	list_multipart_uploads: Sdk.ListMultipartUploadsCommand,
	list_object_versions: Sdk.ListObjectVersionsCommand,
	list_objects: Sdk.ListObjectsCommand,
	list_objects_v2: Sdk.ListObjectsV2Command,
	list_parts: Sdk.ListPartsCommand,
	put_bucket_abac: Sdk.PutBucketAbacCommand,
	put_bucket_accelerate_configuration:
		Sdk.PutBucketAccelerateConfigurationCommand,
	put_bucket_acl: Sdk.PutBucketAclCommand,
	put_bucket_analytics_configuration:
		Sdk.PutBucketAnalyticsConfigurationCommand,
	put_bucket_cors: Sdk.PutBucketCorsCommand,
	put_bucket_encryption: Sdk.PutBucketEncryptionCommand,
	put_bucket_intelligent_tiering_configuration:
		Sdk.PutBucketIntelligentTieringConfigurationCommand,
	put_bucket_inventory_configuration:
		Sdk.PutBucketInventoryConfigurationCommand,
	put_bucket_lifecycle_configuration:
		Sdk.PutBucketLifecycleConfigurationCommand,
	put_bucket_logging: Sdk.PutBucketLoggingCommand,
	put_bucket_metrics_configuration: Sdk.PutBucketMetricsConfigurationCommand,
	put_bucket_notification_configuration:
		Sdk.PutBucketNotificationConfigurationCommand,
	put_bucket_ownership_controls: Sdk.PutBucketOwnershipControlsCommand,
	put_bucket_policy: Sdk.PutBucketPolicyCommand,
	put_bucket_replication: Sdk.PutBucketReplicationCommand,
	put_bucket_request_payment: Sdk.PutBucketRequestPaymentCommand,
	put_bucket_tagging: Sdk.PutBucketTaggingCommand,
	put_bucket_versioning: Sdk.PutBucketVersioningCommand,
	put_bucket_website: Sdk.PutBucketWebsiteCommand,
	put_object: Sdk.PutObjectCommand,
	put_object_acl: Sdk.PutObjectAclCommand,
	put_object_legal_hold: Sdk.PutObjectLegalHoldCommand,
	put_object_lock_configuration: Sdk.PutObjectLockConfigurationCommand,
	put_object_retention: Sdk.PutObjectRetentionCommand,
	put_object_tagging: Sdk.PutObjectTaggingCommand,
	put_public_access_block: Sdk.PutPublicAccessBlockCommand,
	rename_object: Sdk.RenameObjectCommand,
	restore_object: Sdk.RestoreObjectCommand,
	select_object_content: Sdk.SelectObjectContentCommand,
	update_bucket_metadata_inventory_table_configuration:
		Sdk.UpdateBucketMetadataInventoryTableConfigurationCommand,
	update_bucket_metadata_journal_table_configuration:
		Sdk.UpdateBucketMetadataJournalTableConfigurationCommand,
	update_object_encryption: Sdk.UpdateObjectEncryptionCommand,
	upload_part: Sdk.UploadPartCommand,
	upload_part_copy: Sdk.UploadPartCopyCommand,
	write_get_object_response: Sdk.WriteGetObjectResponseCommand,
};
