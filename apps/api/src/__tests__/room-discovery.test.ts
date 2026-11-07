import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';

describe('Room Discovery & Search API (Sprint 1.4)', () => {
  const app = createApp();

  let hostUser: { id: string; username: string };
  let privateRoom: any;

  beforeAll(async () => {
    await connectDatabase();
    await UserModel.deleteMany({ email: { $regex: /@discovery-test\.ktv/ } });
    await RoomModel.deleteMany({ name: { $regex: /Discovery Test/ } });
    await RoomMembershipModel.deleteMany({});

    // Create Host User
    const host = await UserModel.create({
      username: 'discovery_host',
      email: 'host@discovery-test.ktv',
      passwordHash: 'dummy_hash_host',
      avatar: 'https://images.unsplash.com/photo-host.jpg',
      role: 'user',
      status: 'active',
    });
    hostUser = {
      id: host._id.toString(),
      username: host.username,
    };

    // 1. Public Room 1: Pop, standard, idle, 2/10 participants (Available)
    await RoomModel.create({
      name: 'Discovery Test Pop Paradise [Live]',
      description: 'The best pop hits and sing-alongs',
      ownerId: host._id,
      roomType: 'standard',
      visibility: 'public',
      capacity: 10,
      status: 'idle',
      category: 'pop',
      currentParticipantsCount: 2,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    });

    // 2. Public Room 2: Anime, VIP, singing, 5/8 participants (Available)
    await RoomModel.create({
      name: 'Discovery Test Anime Legends + VIP',
      description: 'Sing your favorite J-Rock and anime openings',
      ownerId: host._id,
      roomType: 'vip',
      visibility: 'public',
      capacity: 8,
      status: 'singing',
      category: 'anime',
      currentParticipantsCount: 5,
      currentSongTitle: 'Cruel Angel Thesis',
      currentSingerName: 'Asuka',
      createdAt: new Date('2026-01-02T10:00:00Z'),
    });

    // 3. Full Room: Rock, party, singing, 4/4 participants (Full)
    await RoomModel.create({
      name: 'Discovery Test Rock Stadium Party',
      description: 'Loud classic rock anthems only',
      ownerId: host._id,
      roomType: 'party',
      visibility: 'public',
      capacity: 4,
      status: 'singing',
      category: 'rock',
      currentParticipantsCount: 4,
      createdAt: new Date('2026-01-03T10:00:00Z'),
    });

    // 4. Closed Room: Ballad, standard, closed, 1/10 participants (Closed)
    await RoomModel.create({
      name: 'Discovery Test Ballad Night Off',
      description: 'Acoustic sessions concluded for tonight',
      ownerId: host._id,
      roomType: 'standard',
      visibility: 'public',
      capacity: 10,
      status: 'closed',
      category: 'ballad',
      currentParticipantsCount: 1,
      createdAt: new Date('2026-01-04T10:00:00Z'),
    });

    // 5. Private Room: Pop, VIP, idle (Private - MUST NEVER BE RETURNED BY PUBLIC DISCOVERY)
    privateRoom = await RoomModel.create({
      name: 'Discovery Test Secret Pop Vault',
      description: 'Private family karaoke hangout',
      ownerId: host._id,
      roomType: 'vip',
      visibility: 'private',
      capacity: 6,
      status: 'idle',
      category: 'pop',
      currentParticipantsCount: 1,
      createdAt: new Date('2026-01-05T10:00:00Z'),
    });
  });

  afterAll(async () => {
    await UserModel.deleteMany({ email: { $regex: /@discovery-test\.ktv/ } });
    await RoomModel.deleteMany({ name: { $regex: /Discovery Test/ } });
    await RoomMembershipModel.deleteMany({});
    await disconnectDatabase();
  });

  describe('Public Discovery Visibility Boundary & Security', () => {
    it('returns only public rooms and never exposes private rooms', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const items = res.body.data.items;

      expect(items.length).toBeGreaterThan(0);
      const privateItem = items.find((r: any) => r.id === privateRoom._id.toString());
      expect(privateItem).toBeUndefined();

      // Ensure all returned items have visibility: 'public'
      items.forEach((r: any) => {
        expect(r.visibility).toBe('public');
      });
    });

    it('strictly ignores client query param attempting to request private visibility', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&visibility=private');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const items = res.body.data.items;

      // Must not leak private rooms
      const privateItem = items.find((r: any) => r.id === privateRoom._id.toString());
      expect(privateItem).toBeUndefined();
    });

    it('safely exposes host information without leaking sensitive user fields', async () => {
      const res = await request(app).get(`/api/v1/rooms?search=Discovery Test Pop Paradise`);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);

      const room = items[0];
      expect(room.host).toBeDefined();
      expect(room.host.id).toBe(hostUser.id);
      expect(room.host.username).toBe(hostUser.username);
      expect(room.host.avatar).toBe('https://images.unsplash.com/photo-host.jpg');
      expect(room.host.passwordHash).toBeUndefined();
    });
  });

  describe('Search Functionality', () => {
    it('searches rooms by name substring', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Anime Legends');

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].name).toContain('Anime Legends');
    });

    it('searches rooms by description substring', async () => {
      const res = await request(app).get('/api/v1/rooms?search=anthems only');

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].name).toContain('Rock Stadium Party');
    });

    it('handles regex-special characters safely without crashing', async () => {
      const res = await request(app).get('/api/v1/rooms?search=[Live]');

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].name).toContain('[Live]');
    });

    it('handles special characters like + safely', async () => {
      const res = await request(app).get(`/api/v1/rooms?search=${encodeURIComponent('+ VIP')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].name).toContain('+ VIP');
    });

    it('handles empty or whitespace-only search gracefully', async () => {
      const res = await request(app).get('/api/v1/rooms?search=%20%20%20');

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(4);
    });

    it('rejects search queries exceeding maximum length constraint (100 chars)', async () => {
      const longSearch = 'a'.repeat(101);
      const res = await request(app).get(`/api/v1/rooms?search=${longSearch}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Filter Capabilities', () => {
    it('filters by category (music mood)', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&category=anime');

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].category).toBe('anime');
    });

    it('filters by room style (roomType: vip)', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&roomType=vip');

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].roomType).toBe('vip');
      expect(items[0].name).toContain('Anime Legends');
    });

    it('filters by status (singing)', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&status=singing');

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(2);
      items.forEach((r: any) => {
        expect(r.status).toBe('singing');
      });
    });

    it('filters by availability: "available" (excludes full rooms and closed rooms)', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&availability=available');

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      // Should include Pop (2/10) and Anime (5/8), but exclude Rock (4/4 full) and Ballad (closed)
      expect(items.length).toBe(2);
      items.forEach((r: any) => {
        expect(r.currentParticipantsCount).toBeLessThan(r.capacity);
        expect(r.status).not.toBe('closed');
      });
    });

    it('filters by availability: "full"', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&availability=full');

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].name).toContain('Rock Stadium Party');
      expect(items[0].currentParticipantsCount).toBeGreaterThanOrEqual(items[0].capacity);
    });

    it('handles combined filters (category + roomType + availability)', async () => {
      const res = await request(app).get(
        '/api/v1/rooms?search=Discovery Test&category=anime&roomType=vip&availability=available'
      );

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].name).toContain('Anime Legends');
    });

    it('rejects invalid filter values with 400 validation error', async () => {
      const res = await request(app).get('/api/v1/rooms?category=edm_invalid');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Sorting and Pagination', () => {
    it('sorts by newest first (default and explicit)', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&sortBy=newest');

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(4);
      // Ballad (Jan 4) > Rock (Jan 3) > Anime (Jan 2) > Pop (Jan 1)
      expect(items[0].name).toContain('Ballad');
      expect(items[3].name).toContain('Pop');
    });

    it('sorts by oldest first', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&sortBy=oldest');

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(4);
      // Pop (Jan 1) > Anime (Jan 2) > Rock (Jan 3) > Ballad (Jan 4)
      expect(items[0].name).toContain('Pop');
      expect(items[3].name).toContain('Ballad');
    });

    it('sorts by popularity (highest active participants first)', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&sortBy=popular');

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(4);
      // Anime (5) > Rock (4) > Pop (2) > Ballad (1)
      expect(items[0].name).toContain('Anime');
      expect(items[1].name).toContain('Rock');
      expect(items[2].name).toContain('Pop');
      expect(items[3].name).toContain('Ballad');
    });

    it('returns structured pagination metadata and respects limit and page', async () => {
      const resPage1 = await request(app).get('/api/v1/rooms?search=Discovery Test&limit=2&page=1&sortBy=oldest');

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data.items.length).toBe(2);
      expect(resPage1.body.data.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 4,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      });

      const resPage2 = await request(app).get('/api/v1/rooms?search=Discovery Test&limit=2&page=2&sortBy=oldest');

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.items.length).toBe(2);
      expect(resPage2.body.data.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 4,
        totalPages: 2,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });

    it('handles out of bounds page numbers gracefully', async () => {
      const res = await request(app).get('/api/v1/rooms?search=Discovery Test&page=99');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.page).toBe(99);
      expect(res.body.data.pagination.hasNextPage).toBe(false);
    });
  });
});
