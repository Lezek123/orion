# 2.0.0

Orion v2 is a major architecture change compared to Orion v1:

- **No proxying to external Query Node:** Event processing is now part of Orion, the state is unified in a single database (PostgreSQL) instead of being spread between Joystream Query Node and Orion
- **[Subsquid](https://docs.subsquid.io/)** framework is now used for event processing and GraphQL api generation

For detailed overview of the new architecture, see the [developer guide](docs/developer-guide.md)

## External api changes

### Queries

- Significantly improved query speed should be observed in most cases (the average query should be 2x faster in Orion v2, see [the latest benchmarking results](https://github.com/Joystream/orion/issues/77#issuecomment-1440447170))
- Generally reduced set of supported queries and queryable entity fields. Only queries for the entities based on `members`, `content` and `storage` Joystream modules, which are relevant to Atlas, are now supported by Orion. Additionally, fields like `ownerCuratorGroup`, channel's `collaborators` etc., which are not yet supported by Atlas are also not yet supported in Orion v2.
- `Event` interface has been replaced with `EventData` union, as GraphQL interfaces are not supported in Subsquid. This affects the way `events` query works, as well as removes specific event queries (like `categoryCreatedEvents`, `videoReactedEvents` etc.)
- Deeply nested filtering (for example: `videos(where: { channel: { avatarPhoto: { storageBag: { storageBuckets_some: { id_eq: "1" } } } } })`) is now supported, as well as [nested field queries](https://docs.subsquid.io/query-squid/nested-field-queries/)
- New properties for `where` inputs of queries, like `filed_isNull`, `field_containsInsensitive`, `field_not_(eq|in|contains|containsInsensitive|endsWith|startsWith)`
- Some redundant relationships were removed (for example, entities that had relation to both `Video` and video's `Channel`, now may only have relation to a `Video`. Similarly, entities that contained `ownerMember`/`ownerCuratorGroup` fields, but also had a relation to `Channel`, no longer include redundant channel ownership information), which were previously required to workaround lack of deeply nested filtering. For the same reason, other relations were replaced with more specific ones (for exmaple `auction` instead of `video`). Some examples of this include:
    - Auction bid canceled event has a relation to `bid` instead of `video`,
    - Auction bid made event no longer has `bidAmount`, `previousTopBid` and `previousTopBidder`. They can all be derived from the related `bid` instead,
    - Auction canceled event has a relation to `auction` instead of `video`,
    - Event with `winningBid` field no longer contian relations like `video` or `winner`, as they can be derived from `winningBid`,
    - Most of other nft-related events now have a relation to `nft` instead of `video`.
- NFT's `transactionalStatus` and `transactionalStatusAuction` is now represented as a single `transactionalStatus` which includes `TransactionalStatusAuction` as one of the variants.
- Entity fields like `nftOwnerMember`, `isNftOwnerChannel`, `nftOwnerCuratorGroup` have been relaplaced with a single `NftOwner` union.
- `Channel.followsNum`, `Channel.videoViewsNum` and `Video.viewsNum` fields have been added and can now be used for filtering, sorting etc. (in Orion v1 fields like `Channel.follows`, `Channel.views` and `Video.views` also existed, but had limited functionality)
- Some small differences in the representation of empty values:
    - `Auction.buyNowPrice`: `0` => `null`
    - `Comment.reactionsCountByReactionId`: `[]` => `null`
    - `DistributionBucketFamilyMetadata.areas`: `[]` => `null`
    - `VideoCategory.description`: `''` => `null`
- Some small differences in types:
    - `StorageBag.owner.channelId`: `number` => `string`
- `DistributionBucketFamilyMetadata.areas` is now a `jsonb` field, so it was possible to skip one level of nesting:
    - `DistributionBucketFamilyMetadata.areas.area` => `DistributionBucketFamilyMetadata.areas`
- Some fileds were renamed:
    - `Event.createdAt` => `Event.timestamp`
    - `*Event.contentActor` => `*EventData.actor`
    - `NftBoughtEvent.member` => `NftBoughtEventData.buyer`
    - `Membership.memberBannedFromChannels` => `Membership.bannedFromChannels`
- **Bug fix:** `Auction.topBid` can no longer be a canceled bid (this was previously possible in `OpenAuction`). In case the top bid gets canceled, the next best bid is set as `Auction.topBid`. In case there is no next best bid, `Auction.topBid` is set to `null`.
- **Bug fix:** In Orion v1 (Query Node), when a member placed a bid in `OpenAuction`, it was possible for their bid in an old, already finalized auction for the same nft to get canceled (even if it was already a winning bid). Now this will no longer happen.
- **Bug fix:** `Video.pinnedComment` relation was incorrectly declared in Orion v1 (Query Node) input schema, which resulted in some comments, which were never actually pinned, being returned as `Video.pinnedComment`. This should no longer happen in Orion v2.
- **Bug fix:** In Orion v1 (Query Node) sometimes the `createdAt` field of an entity (like `Memberships`) would be incorrectly modified on update. This will no longer happen in Orion v2, as fields like `createdAt` need to be added explicitly in Subsquid and are no longer automatically managed.
- **Bug fix:** Using property aliases was not working in Orion v1 (for example: `channels { channelId: id }`), this is no longer an issue in Orion v2. 
- Some entity ids are not backward-compatible:
    - `DistributionBucketFamilyMetadata`
    - `StorageBucketOperatorMetadata`
    - `DistributionBucketOperatorMetadata`
    - `MemberMetadata`
    - `Event`
- Some entities no longer have ids, as are now stored as `jsonb` objects in the parent table:
    - `GeoCoordinates`
    - `NodeLocationMetadata`
    - `DistributionBucketFamilyGeographicArea`
    - `CommentReactionsCountByReactionId`
    - `VideoReactionsCountByReactionType`
- In Orion v1 providing a non-existing category id resulted in a creation of empty video category (without any `name` or `description`). Such categories are no longer created, providing non-existing category as part of `ContentMetadata` results in setting `Video.category` to `null` instead.
- `Channel.activeVideoCounter` and `VideoCategory.activeVideoCounter` fields have been removed, instead custom `extendedChannels` and `extendedVideoCategories` queries have been introduced, which allow retrieving the number of active videos per channel/category.
- `createdAt` and `updatedAt` fields are no longer automatically added to entities in Subsquid, so most of the entities no longer include them (unless they were explicitly required by Atlas).
- `Many-to-Many` entity relationships are not supported in Subsquid, so those relationships were refactored to 2-side Many-to-One relationships with a specific "join entity". This means that some queries may now require one more level of nesting, ie.:
    - `Channel.bannedMembers.id` => `Channel.bannedMembers.member.id`
    - `Auction.whitelistedMembers.id` => `Auction.whitelistedMembers.member.id`
    - `Membership.whitelistedInAuctions.id` => `Membership.whitelistedInAuctions.auction.id`
    - `StorageBucket.bags.id` => `StorageBucket.bags.bag.id`
    - `DistributionBucket.bags.id` => `DistributionBucket.bags.bag.id`
    - `StorageBag.storageBuckets.id` => `StorageBag.storageBuckets.storageBucket.id`
    - `StorageBag.distributionBuckets.id` => `StorageBag.distributionBuckets.distributionBucket.id`
- `Language` entity has been removed. Language is now represented as a simple ISO code `string`.
- `DataTime` format is slightly different:
    - `2022-01-01T00:00:00.000Z` => `2022-01-01T00:00:00.000000Z`
- `{ entity { relatedEntityId } }` syntax is not supported in Subsquid, `{ entity { relatedEntity { id } } }` has to be used instead
- the type of entity `id` property is now `String` (previously `ID`)
- `entityByUniqueInput` queries are no longer supported. The new `entityById` queries can be used instead in some cases.
- `admin` query (kill switch) was renamed to `getKillSwitch`
- `categoryFeaturedVideos` and `allCategoriesFeaturedVideos` queries do not exist anymore. Instead, videos featured in a category can be accessed through `category.featuredVideos` relation
- `reportedVideos` and `reportedChannels` authorized queries are temporarily not supported
-  `mostViewedCategories` and `mostViewedCategoriesAllTime` queries have been removed (currently unused by Atalas)
- `discoverChannels` and `promisingChannels` queries has been removed in favor of a new more generic/reusable `mostRecentChannels` query (searching among X most recent channels)
- `popularChannels` query has been removed, as the same results can now be obtained with `channels`/`extendedChannels` query with `orderBy: videoViewsNum_DESC, limit: 15`
- `top10Channels` query has been removed as the same results can now be obtained with `channels`/`extendedChannels` query with `orderBy: followsNum_DESC, limit: 10`
- `mostViewedChannelsConnection` and `mostFollowedChannelsConnection` queries have been removed (currently unused by Atalas)
- `top10VideosThisWeek` and `top10VideosThisMonth` queries have been removed, as the same results can now be obtained with `mostViewedVideosConnection(limit: 10, where: $where, periodDays: (7|30), orderBy: createdAt_DESC)` query
- `search` query is temporarily not supported (unused by Atals)
- `channelNftCollectors` query now takes `channelId: String!` input instead of `where: ChannelNftCollectorsWhereInput`. `orderBy` variants have been reduced to `amount_ASC` and `amount_DESC`
- Censored channels and videos belonging to censored channels, as well as channels/videos/comments excluded by the gateway operator via `excludeContent` mutation are now filtered-out from all query results by default. The same applies to videos belonging to categories not supported by the gateway (see: `setSupportedCategories` [operator mutation](#operator-mutations) and [operator queries](#operator-queries) for more details)
- `VideoHero` entity includes additional fields (`video`, `activatedAt`)
- historical `VideoHero` snapshots can now be queried using autogenerated queries like `videoHeros`, `videoHeroById` etc.
- `ChannelFundsWithdrawnEventData.account` as well as `ChannelRewardClaimedAndWithdrawnEventData.account` are now `null` in case the funds destination was `Council` and account address otherwise (periously this field contained a json string representing the serialized `ChannelFundsDestination` enum)
- Event ids are now assigned sequentially (`00000001`, `00000002`, `00000003` etc.) instead of being `{blockNumber}-{indexInBlock}`. Because all events now live in the same database table, `{blockNumber}-{indexInBlock}` would no longer be a unique identifier when dealing with metaprotocol events (as there can be multiple metaprotocol events triggered by the same runtime event)
- `MetaprotocolTransactionStatus` has been renamed to `MetaprotocolTransactionResult` and now also includes variants that have been previously represented by optional fields of `MetaprotocolTransactionSuccessful` (`MetaprotocolTransactionResultCommentCreated`, `MetaprotocolTransactionResultCommentEdited` etc.). To check if the transaction was generally successful you can now use `event.result.isTypeOf !== 'MetaprotocolTransactionResultFailed'`
- `MetaprotocolTransactionErrored` variant has been replaced with `MetaprotocolTransactionResultFailed` and may include slightly different error messages. The error messages should be completely removed and replaced with error codes in the future.
- **New query:** `getVideoViewPerIpTimeLimit` allows retrieving the current value of `VideoViewPerIpTimeLimit` config value (see also: `setVideoViewPerIpTimeLimit` under [operator mutations](#operator-mutations))
- The default limit for number of returned rows when no limit was provided in Orion v1 was `50`. In Orion v2 there is no default limit(!)
- Entities like `VideoViewEvent`, `Report` and `ChannelFollow` are now part of the Subsquid GraphQL input schema / PostgreSQL database schema. In Orion v1 similar entities were stored in a local MongoDB database and some of them were exposed for the gateway operator via authorized queries like `reportedChannels`, `reportedVideos`. In Orion v2 the api includes autogenerated queries like `videoViewEvents`, `videoViewEventsConnection`, `reports`, `reportsConnection`, `channelFollows`, `channelFollowsConnection` etc. with all the features provided by Subsquid's Openreader. However, just like in Orion v1, this data is also hidden from the public view as it includes sensitive information like IP addresses of the users. Only the Gateway operator is able to query this hidden data, while anyoone else will always recieve empty results instead (see [operator queries](#operator-queries) for more details).
- **New queries:** In order to optimize Atlas queries that do complex filtering of `Event` entities, like `GetNotifications`, `GetNftHistory` and `GetNftActivities`, a few new entities were introduced which include a reltionship to `Event` (this was not possible in Orion v1, as there wasn't a single `Event` entity). The new entities (and associated queries) are: `Notification` (`notifications`, `notificationsConnection`), `NftHistoryEntry` (`nftHistoryEntries`, `nftHistoryEntriesConnection`) and `NftActivity` (`nftActivities`, `nftActivitiesConnection`). 

### Subscriptions
- `stateSubscription` has been renamed to `processorState`, properties have been reduced to `lastProcessedBlock` and `chainHead`

### Mutations

#### User mutations

- `addVideoView`:
    - no longer requires `channelId` and `categoryId` as input
    - now only increases number of video views if the request is a unique request per ip-videoId pair in the last `Config.VideoViewPerIpTimeLimit` seconds (to prevent abuse). This limit can be set via environment variable or through `setVideoViewPerIpTimeLimit` operator mutation.
    - `added` boolean was added to mutation result to indicate whether a new view was added or not
- `followChannel`:
    - channel id is now returned in `channelId` field of the mutation result, instead of `id`
    - `cancelToken` is now returned as part of the mutation result. This token has to be used when unfollowing the channel to prevent arbitrarly triggering `unfollow` when there is not matching channel follow on the client side.
    - only one follow is now counted per client ip to prevent abuse.
    - `added` boolean was added to mutation result to indicate whether a new follow was added or not (depending on whether a matching follow already existed for given ip-channleId pair)
- `unfollowChannel`
    - now additionally requires `token` as input (see `followChannel` changes)
    - `removed` boolean was added to mutation result to indicate whether the follow was removed or not (it is only removed if there is a matching follow per token-channelId pair)
- `reportChannel`/`reportVideo`:
    - now only one report can be sent from given ip for given channel/video to prevent abuse.
    - `created` boolean was added to mutation result to indicate whether a new report was created

#### Operator mutations

- All operator mutations now require `x-operator-secret` HTTP header to be provided, with value equal to `OPERATOR_SECRET` environment value. There is currently no distinction between secret used for content featuring and other operator activities.
- `setVideoHero`
    - the history of video heros' set is now persisted in the database and is publicly accessible,
    - mutation result now only includes the id of the created `VideoHero` entity
- `setCategoryFeaturedVideos`
    - the mutation result now only includes `categoryId` and number of featured videos set / unset 
- **New mutation:** `setSupportedCategories` - allows specifying which video categories are supported by the gateway. Content that doesn't belong to supported categories will not be displayed in query results. This includes the categories themselves, videos, nfts, auctions, comments, reactions etc.
- **New mutation:** `setVideoViewPerIpTimeLimit` - allows specifying the time after which a video view triggered from the same ip address will be counted again (see: `addVideoView`)
- **New mutation:** `excludeContent` - allows excluding specified channels/videos/comments from all query results. Can be used as a gateway-level mechanism to censor some of the content.
- **New mutation:** `restoreContent` - effectively the opposite of `excludeContent`, can be used to make content appear in the query results again (if previously excluded).

#### Operator queries

- **New feature:** An authorized operator, who provided a valid `x-operator-secret` HTTP header, can optionally include `x-display-hidden-entities: all` HTTP header. If `x-display-hidden-entities: all` header is included, any entities hidden from the public view will be included in the query results (unless explicitly filtered out by the query `where` conditions or otherwise). Those include:
    - Censored (by the DAO) channels & videos and their related entities (nfts, auctions, comments, reactions, metadata entities etc.),
    - Excluded (censored by the Gateway) channels, videos, comments and their related entities (nfts, auctions, reactions, metadata entities etc.),
    - Any content not belonging to a category currently supported by the Gateway,
    - Other entities hidden from public view for security reasons: `VideoViewEvent`s, `Report`s, `ChannelFollow`s.