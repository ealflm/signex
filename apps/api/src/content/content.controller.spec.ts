import { BadRequestException } from '@nestjs/common';
import { ContentController } from './content.controller';

describe('ContentController', () => {
  const service = {
    updateBlock: jest.fn().mockResolvedValue({ revision: 9 }),
    getBlock: jest.fn().mockResolvedValue({ foo: 'bar' }),
  } as any;
  const ctrl = new ContentController(service);

  it('PUT delegates kind/key/body/actor to ContentService.updateBlock', async () => {
    const res = await ctrl.update(
      'PAGE',
      'home.hero',
      { data: { x: 1 }, expectedRevision: 4 },
      { id: 'user_1' } as any,
    );
    expect(res).toEqual({ revision: 9 });
    expect(service.updateBlock).toHaveBeenCalledWith({ id: 'user_1' }, 'PAGE', 'home.hero', { x: 1 }, 4);
  });

  it('GET delegates to ContentService.getBlock', async () => {
    expect(await ctrl.get('SEO', 'seo.home')).toEqual({ foo: 'bar' });
    expect(service.getBlock).toHaveBeenCalledWith('SEO', 'seo.home');
  });

  it('rejects an unknown kind with 400', async () => {
    await expect(
      ctrl.update('NONSENSE', 'k', { data: {}, expectedRevision: 0 }, { id: 'u' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
