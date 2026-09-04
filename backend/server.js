// Local dev entry point. Vercel uses api/index.js instead (serverless, no listen()).
const app = require('./app');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Namita Ji server running on port ${PORT}`));
