const noCategoryVideosSupportedByDefault =
  process.env.SUPPORT_NO_CATEGORY_VIDEOS === 'true' ||
  process.env.SUPPORT_NO_CATEGORY_VIDEOS === '1'

module.exports = class Views2000000000000 {
  name = 'Views2000000000000'

  viewDefinitions = {
    channel: [`is_excluded='0'`, `is_censored='0'`],
    video: [
      `is_excluded='0'`,
      `is_censored='0'`,
      `EXISTS(SELECT 1 FROM "channel" WHERE "id"="channel_id")`,
      `EXISTS(SELECT 1 FROM "video_category" WHERE "id"="category_id" AND "is_supported"='1')
        OR (
          "category_id" IS NULL
          AND COALESCE(
            (SELECT "value" FROM "gateway_config" WHERE "id"='SUPPORT_NO_CATEGORY_VIDEOS'),
            ${noCategoryVideosSupportedByDefault ? "'1'" : "'0'"}
          )='1'
        )`
    ],
    video_category: [`"is_supported" = '1'`],
    owned_nft: [`EXISTS(SELECT 1 FROM "video" WHERE "id"="video_id")`],
    auction: [`EXISTS(SELECT 1 FROM "owned_nft" WHERE "id"="nft_id")`],
    bid: [`EXISTS(SELECT 1 FROM "owned_nft" WHERE "id"="nft_id")`],
    comment: [`is_excluded='0'`, `EXISTS(SELECT 1 FROM "video" WHERE "id"="video_id")`],
    comment_reaction: [`EXISTS(SELECT 1 FROM "comment" WHERE "id"="comment_id")`],
    license: [`EXISTS(SELECT 1 FROM "video" WHERE "license_id"="this"."id")`],
    video_media_metadata: [`EXISTS(SELECT 1 FROM "video" WHERE "id"="video_id")`],
    video_media_encoding: [`EXISTS(SELECT 1 FROM "video_media_metadata" WHERE "encoding_id"="this"."id")`],
    video_reaction: [`EXISTS(SELECT 1 FROM "video" WHERE "id"="video_id")`],
    video_subtitle: [`EXISTS(SELECT 1 FROM "video" WHERE "id"="video_id")`],
    // TODO: Consider all events having ref to a video they're related to - this will make filtering much easier
    event: [
      `("data"->>'channel' IS NULL OR EXISTS(SELECT 1 FROM "channel" WHERE "id"="data"->>'channel'))`,
      `("data"->>'video' IS NULL OR EXISTS(SELECT 1 FROM "video" WHERE "id"="data"->>'video'))`,
      `("data"->>'nft' IS NULL OR EXISTS(SELECT 1 FROM "owned_nft" WHERE "id"="data"->>'nft'))`,
      `("data"->>'auction' IS NULL OR EXISTS(SELECT 1 FROM "auction" WHERE "id"="data"->>'auction'))`,
      `("data"->>'bid' IS NULL OR EXISTS(SELECT 1 FROM "bid" WHERE "id"="data"->>'bid'))`,
      `("data"->>'comment' IS NULL OR EXISTS(SELECT 1 FROM "comment" WHERE "id"="data"->>'comment'))`
    ],
    notification: [`EXISTS(SELECT 1 FROM "event" WHERE "id"="event_id")`],
    nft_history_entry: [`EXISTS(SELECT 1 FROM "event" WHERE "id"="event_id")`],
    nft_activity: [`EXISTS(SELECT 1 FROM "event" WHERE "id"="event_id")`],
    // HIDDEN entities
    video_view_event: ['FALSE'],
    channel_follow: ['FALSE'],
    report: ['FALSE']
  }


  async up(db) {
    // Create new schema for the processor in order to be easily able to access "hidden" entities
    await db.query(`CREATE SCHEMA "processor"`)
    for (const [tableName, viewConditions] of Object.entries(this.viewDefinitions)) {
      await db.query(`ALTER TABLE "${tableName}" SET SCHEMA "processor"`)
      await db.query(`
        CREATE VIEW "${tableName}" AS
          SELECT *
          FROM "processor"."${tableName}" AS "this"
          WHERE ${viewConditions.map(cond => `(${cond})`).join(" AND\n")}
      `)
    }
  }

  async down(db) {
    for (const viewName of Object.keys(this.viewDefinitions)) {
      await db.query(`DROP VIEW "${viewName}"`)
      await db.query(`ALTER TABLE "processor"."${viewName}" SET SCHEMA "public"`)
    }
    await db.query(`DROP SCHEMA "processor"`)
  }
}