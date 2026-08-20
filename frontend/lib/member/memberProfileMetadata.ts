/**
 * lib/member/memberProfileMetadata.ts
 *
 * The member PROFILE document shape (types + strict/lenient parsers +
 * the agent-service projection) is owned by `@figaro-protocol/sdk` — Layer-A,
 * published across the public seam so an integrator reading
 * `MembersRegistry.metadataURI` learns the shape from the SDK. This module
 * is the frontend's re-export shim; existing `@/lib/member/...` call sites
 * keep working. Add nothing here — extend the SDK module.
 */

export type {
    MemberProfileMetadata,
    MemberAgentServices,
    MemberAssetReferences,
    CounterpartyBinding,
    AssemblyBindingRecord,
    BuyerAssemblySubscription,
    DisclosurePolicyEntry,
    AgentServiceInfo,
} from "@figaro-protocol/sdk";

export {
    parseMemberProfileDocument,
    tryParseMemberProfileDocument,
    projectAgentServices,
} from "@figaro-protocol/sdk";
