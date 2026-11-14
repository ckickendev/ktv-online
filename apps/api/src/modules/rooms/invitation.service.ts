import { randomBytes, createHash } from 'crypto';
import { Types } from 'mongoose';
import {
  CreateInvitationResponseDto,
  InvitationPreviewDto,
  InvitationPreviewStatus,
  RoomInvitationDto,
} from '@ktv/contracts';
import { RoomInvitationModel } from './invitation.model.js';
import { RoomModel } from './room.model.js';
import { RoomMembershipModel } from './membership.model.js';
import { IRoomDocument } from './room.types.js';

export class InvitationService {
  /**
   * Generates a cryptographically secure random token (192-bit entropy).
   */
  private generateRawToken(): string {
    return randomBytes(24).toString('base64url');
  }

  /**
   * Hashes a raw token with SHA-256 for secure database persistence.
   */
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken.trim()).digest('hex');
  }

  /**
   * Creates a new invitation link for an authorized room host.
   * Atomically revokes any existing active invitation for this room.
   */
  async createInvitation(
    roomId: string,
    hostUserId: string,
    expiresInHours = 48
  ): Promise<{ success: boolean; data?: CreateInvitationResponseDto; error?: string }> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(hostUserId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const hostObjectId = new Types.ObjectId(hostUserId);

    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    // Host-only check: only the room owner can create invitation links
    if (room.ownerId.toString() !== hostUserId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    // Revoke any previous active invitations for this room
    await RoomInvitationModel.updateMany(
      { roomId: roomObjectId, status: 'active', revokedAt: null },
      { $set: { status: 'revoked', revokedAt: new Date() } }
    ).exec();

    // Generate secure token and hash
    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);

    const validHours = Math.min(Math.max(expiresInHours, 1), 168); // 1h to 7 days
    const expiresAt = new Date(Date.now() + validHours * 60 * 60 * 1000);

    const invitation = await RoomInvitationModel.create({
      roomId: roomObjectId,
      tokenHash,
      createdBy: hostObjectId,
      expiresAt,
      status: 'active',
      revokedAt: null,
    });

    return {
      success: true,
      data: {
        id: invitation._id.toString(),
        roomId: roomObjectId.toString(),
        token: rawToken,
        expiresAt: expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      },
    };
  }

  /**
   * Retrieves active invitation metadata for a room (host only).
   * Note: The raw token is NEVER stored or returned here.
   */
  async getActiveInvitation(
    roomId: string,
    hostUserId: string
  ): Promise<{ success: boolean; data?: RoomInvitationDto | null; error?: string }> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(hostUserId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const room = await RoomModel.findById(new Types.ObjectId(roomId)).exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.ownerId.toString() !== hostUserId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    const now = new Date();
    const activeInvitation = await RoomInvitationModel.findOne({
      roomId: new Types.ObjectId(roomId),
      status: 'active',
      revokedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .exec();

    if (!activeInvitation) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: activeInvitation.toJSON() as unknown as RoomInvitationDto,
    };
  }

  /**
   * Revokes any active invitation for a room (host only).
   */
  async revokeInvitation(
    roomId: string,
    hostUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(hostUserId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const room = await RoomModel.findById(new Types.ObjectId(roomId)).exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.ownerId.toString() !== hostUserId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    await RoomInvitationModel.updateMany(
      { roomId: new Types.ObjectId(roomId), status: 'active', revokedAt: null },
      { $set: { status: 'revoked', revokedAt: new Date() } }
    ).exec();

    return { success: true };
  }

  /**
   * Previews an invitation safely without revealing sensitive data or consuming capacity.
   */
  async previewInvitation(
    rawToken: string,
    requestingUserId?: string
  ): Promise<{ success: boolean; data?: InvitationPreviewDto; error?: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      return { success: false, error: 'INVALID_TOKEN' };
    }

    const tokenHash = this.hashToken(rawToken);
    const invitation = await RoomInvitationModel.findOne({ tokenHash }).exec();

    if (!invitation) {
      return {
        success: true,
        data: {
          invitation: { status: 'invalid' },
        },
      };
    }

    if (invitation.revokedAt || invitation.status === 'revoked') {
      return {
        success: true,
        data: {
          invitation: { status: 'revoked' },
        },
      };
    }

    const now = new Date();
    if (invitation.expiresAt < now) {
      return {
        success: true,
        data: {
          invitation: {
            status: 'expired',
            expiresAt: invitation.expiresAt.toISOString(),
          },
        },
      };
    }

    // Retrieve room
    const room = (await RoomModel.findById(invitation.roomId)
      .populate('ownerId', 'username displayName avatar')
      .exec()) as IRoomDocument | null;

    if (!room) {
      return {
        success: true,
        data: {
          invitation: { status: 'room_closed' },
        },
      };
    }

    const roomJson = room.toJSON() as Record<string, unknown>;

    let previewStatus: InvitationPreviewStatus = 'valid';
    if (room.status === 'closed') {
      previewStatus = 'room_closed';
    } else if (room.currentParticipantsCount >= room.capacity) {
      previewStatus = 'room_full';
    }

    // Evaluate user state if requesting user is authenticated
    let userState = {
      isAuthenticated: false,
      isMember: false,
      isHost: false,
      isKicked: false,
    };

    if (requestingUserId && Types.ObjectId.isValid(requestingUserId)) {
      const userObjectId = new Types.ObjectId(requestingUserId);
      const isHost = room.ownerId.toString() === requestingUserId;

      const [isMember, isKicked] = await Promise.all([
        RoomMembershipModel.exists({
          roomId: room._id,
          userId: userObjectId,
          status: 'active',
        }),
        RoomMembershipModel.exists({
          roomId: room._id,
          userId: userObjectId,
          status: 'left',
          kickedAt: { $ne: null },
        }),
      ]);

      userState = {
        isAuthenticated: true,
        isMember: Boolean(isMember),
        isHost,
        isKicked: Boolean(isKicked),
      };
    }

    return {
      success: true,
      data: {
        invitation: {
          status: previewStatus,
          expiresAt: invitation.expiresAt.toISOString(),
        },
        room: {
          id: (roomJson.id as string) || room._id.toString(),
          name: room.name,
          description: room.description ?? null,
          category: room.category,
          roomType: room.roomType,
          visibility: room.visibility,
          capacity: room.capacity,
          currentParticipantsCount: room.currentParticipantsCount,
          status: room.status,
          atmospherePreset: room.atmospherePreset,
          host: roomJson.host as InvitationPreviewDto['room'] extends { host?: infer H } ? H : undefined,
        },
        userState,
      },
    };
  }

  /**
   * Validates an invitation credential against a specific room.
   */
  async validateInvitation(
    rawToken: string,
    roomId: string
  ): Promise<{ valid: boolean; error?: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      return { valid: false, error: 'INVITATION_REQUIRED' };
    }

    const tokenHash = this.hashToken(rawToken);
    const invitation = await RoomInvitationModel.findOne({ tokenHash }).exec();

    if (!invitation) {
      return { valid: false, error: 'INVITATION_INVALID' };
    }

    if (invitation.roomId.toString() !== roomId.toString()) {
      return { valid: false, error: 'INVITATION_ROOM_MISMATCH' };
    }

    if (invitation.revokedAt || invitation.status === 'revoked') {
      return { valid: false, error: 'INVITATION_REVOKED' };
    }

    if (invitation.expiresAt < new Date()) {
      return { valid: false, error: 'INVITATION_EXPIRED' };
    }

    return { valid: true };
  }

  /**
   * Resolves the room ID from a raw invitation token.
   */
  async resolveInvitationRoomId(
    rawToken: string
  ): Promise<{ success: boolean; roomId?: string; error?: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      return { success: false, error: 'INVITATION_REQUIRED' };
    }

    const tokenHash = this.hashToken(rawToken);
    const invitation = await RoomInvitationModel.findOne({ tokenHash }).exec();

    if (!invitation) {
      return { success: false, error: 'INVITATION_INVALID' };
    }

    if (invitation.revokedAt || invitation.status === 'revoked') {
      return { success: false, error: 'INVITATION_REVOKED' };
    }

    if (invitation.expiresAt < new Date()) {
      return { success: false, error: 'INVITATION_EXPIRED' };
    }

    return { success: true, roomId: invitation.roomId.toString() };
  }
}

export const invitationService = new InvitationService();
