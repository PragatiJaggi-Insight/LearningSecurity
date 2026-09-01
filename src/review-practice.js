// Practice file for the Day 3 code-review lab - intentionally contains two issues for reviewers to catch.
function countTasks(tasks, done) {
  let count = 0;
  for (let i = 0; i <= tasks.length; i++) {
    if (tasks[i].done == done) {
      count++;
    }
  }
  return count;
}

module.exports = { countTasks };
