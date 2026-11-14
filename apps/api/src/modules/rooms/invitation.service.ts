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

    // Revoke any previous active general invitations for this room (preserves friend-specific invitations)
    await RoomInvitationModel.updateMany(
      { roomId: roomObjectId, recipientId: null, status: 'active', revokedAt: null },
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
      recipientId: null,
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
   * Creates a dedicated, recipient-bound invitation for a specific friend.
   * Only revokes any prior active invitation for that specific friend in this room.
   */
  async createFriendInvitation(
    roomId: string,
    hostUserId: string,
    friendUserId: string,
    expiresInHours = 48
  ): Promise<{ success: boolean; data?: CreateInvitationResponseDto; error?: string }> {
    if (
      !Types.ObjectId.isValid(roomId) ||
      !Types.ObjectId.isValid(hostUserId) ||
      !Types.ObjectId.isValid(friendUserId)
    ) {
      return { success: false, error: 'INVALID_ID' };
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const hostObjectId = new Types.ObjectId(hostUserId);
    const friendObjectId = new Types.ObjectId(friendUserId);

    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    // Authoritative host check
    if (room.ownerId.toString() !== hostUserId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    // Revoke only previous active invitations for this specific friend in this room
    await RoomInvitationModel.updateMany(
      { roomId: roomObjectId, recipientId: friendObjectId, status: 'active', revokedAt: null },
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
      recipientId: friendObjectId,
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

    // Recipient-bound check: if invitation is dedicated to a friend, verify identity (AUD-INV-01)
    if (invitation.recipientId) {
      if (!requestingUserId || invitation.recipientId.toString() !== requestingUserId) {
        return {
          success: true,
          data: {
            invitation: { status: 'invalid' },
          },
        };
      }
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
    roomId: string,
    requestingUserId?: string
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

    // Recipient-bound validation: if token is bound to a specific friend, verify caller identity (AUD-INV-01)
    if (invitation.recipientId) {
      if (!requestingUserId || invitation.recipientId.toString() !== requestingUserId) {
        return { valid: false, error: 'INVITATION_RECIPIENT_MISMATCH' };
      }
    }

    return { valid: true };
  }

  /**
   * Resolves the room ID from a raw invitation token.
   */
  async resolveInvitationRoomId(
    rawToken: string,
    requestingUserId?: string
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

    // Recipient-bound identity check (AUD-INV-01)
    if (invitation.recipientId) {
      if (!requestingUserId || invitation.recipientId.toString() !== requestingUserId) {
        return { success: false, error: 'INVITATION_RECIPIENT_MISMATCH' };
      }
    }

    return { success: true, roomId: invitation.roomId.toString() };
  }

  /**
   * Validates a recipient-bound invitation record directly by invitation ID.
   * Enforces fail-closed recipient identity check (caller must equal recipientId).
   */
  async validateRecipientInvitationById(
    invitationId: string,
    roomId: string,
    requestingUserId: string
  ): Promise<{ valid: boolean; error?: string }> {
    if (
      !Types.ObjectId.isValid(invitationId) ||
      !Types.ObjectId.isValid(roomId) ||
      !Types.ObjectId.isValid(requestingUserId)
    ) {
      return { valid: false, error: 'INVITATION_INVALID' };
    }

    const invitation = await RoomInvitationModel.findById(new Types.ObjectId(invitationId)).exec();

    if (!invitation) {
      return { valid: false, error: 'INVITATION_INVALID' };
    }

    if (invitation.roomId.toString() !== roomId.toString()) {
      return { valid: false, error: 'INVITATION_ROOM_MISMATCH' };
    }

    // Fail-closed recipient binding verification
    if (!invitation.recipientId || invitation.recipientId.toString() !== requestingUserId) {
      return { valid: false, error: 'INVITATION_RECIPIENT_MISMATCH' };
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
   * Retrieves pending active invitations for a recipient inbox.
   * Never exposes raw tokens or token hashes.
   */
  async getPendingInvitationsForRecipient(
    recipientUserId: string
  ): Promise<{ success: boolean; data?: any[]; error?: string }> {
    if (!Types.ObjectId.isValid(recipientUserId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const recipientObjectId = new Types.ObjectId(recipientUserId);
    const now = new Date();

    const invitations = await RoomInvitationModel.find({
      recipientId: recipientObjectId,
      status: 'active',
      revokedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .populate({
        path: 'roomId',
        select: 'name category visibility capacity currentParticipantsCount status atmospherePreset ownerId',
        populate: {
          path: 'ownerId',
          select: 'username displayName avatar',
        },
      })
      .populate('createdBy', 'username displayName avatar')
      .limit(50)
      .exec();

    // Filter out invitations for rooms that are closed or deleted
    const validInvitations = invitations.filter((inv) => {
      const room = inv.roomId as unknown as IRoomDocument | null;
      return room && room.status !== 'closed';
    });

    const items = validInvitations.map((inv) => {
      const room = inv.roomId as unknown as any;
      const inviter = inv.createdBy as unknown as any;

      return {
        id: inv._id.toString(),
        roomId: room._id.toString(),
        room: {
          id: room._id.toString(),
          name: room.name,
          category: room.category,
          visibility: room.visibility,
          capacity: room.capacity,
          currentParticipantsCount: room.currentParticipantsCount,
          status: room.status,
          atmospherePreset: room.atmospherePreset,
          host: room.ownerId
            ? {
                id: (room.ownerId._id || room.ownerId).toString(),
                username: room.ownerId.username,
                displayName: room.ownerId.displayName ?? null,
                avatar: room.ownerId.avatar ?? null,
              }
            : undefined,
        },
        inviter: {
          id: (inviter._id || inviter).toString(),
          username: inviter.username,
          displayName: inviter.displayName ?? null,
          avatar: inviter.avatar ?? null,
        },
        expiresAt: inv.expiresAt instanceof Date ? inv.expiresAt.toISOString() : String(inv.expiresAt),
        createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : String(inv.createdAt),
      };
    });

    return { success: true, data: items };
  }

  /**
   * Dismisses a pending invitation (recipient only, atomic conditional operation).
   */
  async dismissInvitationByRecipient(
    invitationId: string,
    recipientUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!Types.ObjectId.isValid(invitationId) || !Types.ObjectId.isValid(recipientUserId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const invitationObjectId = new Types.ObjectId(invitationId);
    const recipientObjectId = new Types.ObjectId(recipientUserId);

    const invitation = await RoomInvitationModel.findById(invitationObjectId).exec();
    if (!invitation) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // Recipient-only check
    if (!invitation.recipientId || invitation.recipientId.toString() !== recipientUserId) {
      return { success: false, error: 'FORBIDDEN_NOT_RECIPIENT' };
    }

    // Idempotent: if already revoked/dismissed, return success
    if (invitation.revokedAt || invitation.status === 'revoked') {
      return { success: true };
    }

    // Atomic conditional update
    const updated = await RoomInvitationModel.findOneAndUpdate(
      {
        _id: invitationObjectId,
        recipientId: recipientObjectId,
        status: 'active',
        revokedAt: null,
      },
      {
        $set: {
          status: 'revoked',
          revokedAt: new Date(),
        },
      },
      { new: true }
    ).exec();

    if (!updated) {
      // If concurrent dismissal won, still idempotent success
      return { success: true };
    }

    return { success: true };
  }
}

export const invitationService = new InvitationService();
