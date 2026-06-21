import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('writeAudit forwards the exact create payload to tx.auditLog.create', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { auditLog: { create } } as any;
    const svc = new AuditService();
    await svc.writeAudit(tx, {
      userId: 'user_1',
      action: 'content.update',
      entityType: 'contentBlock',
      entityId: 'PAGE:home.hero',
      meta: { key: 'home.hero' },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        action: 'content.update',
        entityType: 'contentBlock',
        entityId: 'PAGE:home.hero',
        meta: { key: 'home.hero' },
      },
    });
  });

  it('defaults entityId/meta/userId to null/undefined-safe values', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { auditLog: { create } } as any;
    await new AuditService().writeAudit(tx, {
      action: 'release.publish',
      entityType: 'release',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: null,
        action: 'release.publish',
        entityType: 'release',
        entityId: null,
        meta: undefined,
      },
    });
  });
});
