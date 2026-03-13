// now this thing isnt even needed WHY

const { ALL } = require("dns");
const fs = require("fs");

module.exports = function registerSearch(app, config) {
    const {
        ALLOWED_CHANNEL_IDS,
        WATCH_ALL_INVITED_CHANNELS,
        BANLIST_FILE,
    } = config;
    
    function ensureBanFile() {
        if (!fs.existsSync(BANLIST_FILE)) {
          fs.writeFileSync(BANLIST_FILE, "# Banned users\n", "utf8");
        }
    }

    function loadBanSet() {
        ensureBanFile();
        const raw = fs.readFileSync(BANLIST_FILE, "utf8");
        return new Set(
            raw
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l && !l.startsWith("#"))
        );
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function buildSearchRegex(word) {
        return new RegExp(escapeRegex(word), 'gi');
    }

    async function getSearchableChannels(client) {
        if (!WATCH_ALL_INVITED_CHANNELS) {
            return ALLOWED_CHANNEL_IDS;
        }

        const ids = [];
        let cursor;

        do {
            const res = await client.conversations.list({
                types: "public_channel,private_channel",
                limit: 200,
                cursor,
            });
            
            const channels = res.channels || [];
            for (const ch of channels) {
                if (ch.is_member) ids.push(ch.id);
            }

            cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);

        return ids;
    }

    async function fetchThreadReplies(clinet, channel, threadTs, oldestTs) {
        let cursor;
        const replies = [];

        do {
            const res = await client.conversations.replies({
                channel,
                ts: threadTs,
                limit: 200,
                cursor,
                oldest: oldestTs,
                inclusive: true,
            });

            const messages = res.messages || [];
            replies.push(...messages);

            cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);

        return ids;
    }

    async function countChannelWords(client, channelId, regex, oldestTs, bannedUsers) {
        let cursor;
        let total = 0;
        let messagesScanned = 0;

        do {
            const res = await client.conversations.history({
                channel: channelId,
                limit: 200,
                cursor,
                oldest: oldestTs,
                inclusive: true,
            });

            const messages = res.messages || [];

            for (const msg of messages) {
                if (!msg || !msg.text) continue;
                if (msg.subtype && msg.subtype !== "") continue;

                const parentMatches = msg.text.match(regex);
                if (parentMatches) total += parentMatches.length;

                if (msg.reply_count && msg.thread_ts && msg.thread_ts === msg.ts) {
                    const replies = await fetchThreadReplies(client, channelId, msg.thread_ts, oldestTs);

                    for (const reply of replies) {
                        if (reply.ts === msg.ts) continue;
                        if (!reply.text) continue;
                        messagesScanned++;

                        const replyMatches = reply.text.match(regex);
                        if (replyMatches) total += replyMatches.length;
                    }
                }
            }

            cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);
        
        return {total, messagesScanned};
    } 

    async function countWords(client, term, days) {
        const bannedUsers = loadBanSet();
        const regex = buildSearchRegex(term);
        const oldestTs = String(Math.floor(Date.now() / 1000) - days * 24 * 60 * 60);

        const channelIds = await getSearchableChannels(client);
        const perChannel = [];
        let grandTotal = 0;
        let totalMsgsScanned = 0;

        for (const channelId of channelIds) {
            try {
                const info = await client.conversations.info({ channel:channelId});
                const channelName = info.channel?.name || channelId;

                const result = await countChannelWords(
                    client,
                    channelId,
                    regex,
                    oldestTs,
                    bannedUsers
                );

                grandTotal += result.total;
                totalMsgsScanned += result.messagesScanned;

                perChannel.push({
                    channelId,
                    channelName,
                    count: result.total,
                });
            } catch (e) {
                perChannel.push({
                    channelId,
                    channelName: channelId,
                    count: 0,
                    error: e?.data?.error || e?.message || "unknown error?",
                });
            }
        }

        perChannel.sort((a, b) => b.count - a.count);

        return {
            term,
            days,
            total: grandTotal,
            messagesScanned: totalMsgsScanned,
            channelsScanned: channelId.length,
            perChannel,
        };
    }

    return {
        countWords,
    };
};