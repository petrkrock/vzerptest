const b = require('bcryptjs');
const { Client } = require('pg');

(async () => {
  const hash = b.hashSync('admin123', 10);
  console.log('generated:', hash);

  const client = new Client({ connectionString: 'postgres://postgres:1111@localhost:5432/erp' });
  await client.connect();
  await client.query("UPDATE public.profiles SET password_hash = $1 WHERE email = 'admin@vz.tech'", [hash]);
  const res = await client.query("SELECT password_hash FROM public.profiles WHERE email = 'admin@vz.tech'");
  await client.end();

  const stored = res.rows[0]?.password_hash;
  console.log('stored   :', stored);
  console.log('match    :', b.compareSync('admin123', stored));
})();