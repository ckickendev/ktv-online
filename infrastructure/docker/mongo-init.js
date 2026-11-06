// MongoDB initialization script for local container development
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'ktv_online');

// Create initial application user if not exists
db.createUser({
  user: 'ktv_user',
  pwd: 'ktv_password_dev',
  roles: [
    {
      role: 'readWrite',
      db: process.env.MONGO_INITDB_DATABASE || 'ktv_online',
    },
  ],
});

print('KTV Online local MongoDB initialized successfully.');
