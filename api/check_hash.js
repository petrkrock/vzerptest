const b = require('bcryptjs');
const hash = '.X4xcsehuuMVsRi9oRuduTIZq2juy.GwzR3PwFsHeTgTVPc1xi';
console.log('match:', b.compareSync('admin123', hash));