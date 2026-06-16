const logs = [
    "[10:15:30 AM] Start",
    "[10:17:45 AM] End"
];
function parseLogTime(logStr) {
    const match = logStr.match(/^\[(.*?)\]/);
    if (match) {
        const d = new Date(new Date().toDateString() + " " + match[1]);
        return d.getTime();
    }
    return null;
}
const start = parseLogTime(logs[0]);
const end = parseLogTime(logs[logs.length-1]);
console.log((end - start)/1000, "seconds");
