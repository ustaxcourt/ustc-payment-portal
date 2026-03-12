import app from './app';

const PORT = process.env.API_PORT || 3001;

app.listen(PORT, () => {
  console.log(`Transaction Dashboard API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
