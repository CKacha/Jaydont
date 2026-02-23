const fs = required("fs");

module.exports = function registerCommands(app, { STATE_FILE }) {
    function loadState() {
        if (!fs.existsSync(STATE_FILE)) return { count: 0 };
        const lines = fs.readFileSync(STATE_FILE, "utf-8").split("\n");
        const [count] = (lines[1] || "0,0").split(",");
        return { count: parseInt(count) || 0 };
    }

    app.command("/jaydont", async ({ ack, respond }) => {
        await ack();
        const state = loadState();
        await respond(`Total jaydonts: *${state.count}*`);
    });
    
    app.command("/jaycheck", async ({ ack, respond }) => {
        await ack();
        const state = loadState();
        await respond(`Total jaydonts: *${state.count}*`);
    });
};

