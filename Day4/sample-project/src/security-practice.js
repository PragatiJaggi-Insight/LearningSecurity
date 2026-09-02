// Practice file for the Day 4 CodeQL lab - intentionally vulnerable, do NOT copy this pattern into real code.
const { exec } = require('child_process');

// Looks up a task's commit history by shelling out - vulnerable because `taskId`
// is concatenated straight into the shell command instead of passed as a safe argument.
// A taskId like "x; rm -rf /" would run as a second command.
function getTaskHistory(taskId, callback) {
  exec('git log --grep=' + taskId, (err, stdout) => {
    callback(err, stdout);
  });
}

module.exports = { getTaskHistory };
