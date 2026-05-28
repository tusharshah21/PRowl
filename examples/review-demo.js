// Demo file for exercising PRowl end-to-end on a real PR.
// It contains three deliberate issues (one per detectable type) plus one
// intentionally clean function that must NOT be flagged.

const db = require("./db");

// (1) SECURITY — SQL injection: user input concatenated straight into a query.
function getOrder(req, res) {
  const orderId = req.query.id;
  const sql = "SELECT * FROM orders WHERE id = " + orderId;
  return db.query(sql);
}

// (2) BUG — unguarded access: cart.items may be undefined/empty, [0].price throws.
function firstItemPrice(cart) {
  return cart.items[0].price;
}

// (3) PERFORMANCE — O(n^2) duplicate scan with a doubly-nested loop.
function hasDuplicate(arr) {
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length; j++) {
      if (i !== j && arr[i] === arr[j]) {
        return true;
      }
    }
  }
  return false;
}

// (4) CLEAN — straightforward, no issues. Should produce NO comment.
function add(a, b) {
  return a + b;
}

module.exports = { getOrder, firstItemPrice, hasDuplicate, add };
