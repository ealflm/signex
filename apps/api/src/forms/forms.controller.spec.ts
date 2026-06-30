import { Test, TestingModule } from '@nestjs/testing';
import {
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

describe('FormsController', () => {
  let controller: FormsController;
  let service: {
    submit: jest.Mock;
    list: jest.Mock;
    summary: jest.Mock;
    clearSpam: jest.Mock;
    get: jest.Mock;
    setStatus: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      submit: jest.fn().mockResolvedValue({ ok: true }),
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      summary: jest.fn().mockResolvedValue({
        total: 0,
        new: 0,
        read: 0,
        archived: 0,
        spam: 0,
        series: [],
      }),
      clearSpam: jest.fn().mockResolvedValue({ deleted: 0 }),
      get: jest
        .fn()
        .mockResolvedValue({ id: 'sub_1', status: 'NEW', upload: null }),
      setStatus: jest.fn().mockResolvedValue({ id: 'sub_1', status: 'READ' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FormsController],
      providers: [{ provide: FormsService, useValue: service }],
    }).compile();

    controller = module.get(FormsController);
  });

  function makeReq(ip = '127.0.0.1', ua = 'jest') {
    return {
      ip,
      headers: { 'user-agent': ua },
    } as any;
  }

  it('routes submit to FormsService with ip and ua', async () => {
    const body = { name: 'Bob', email: 'bob@example.com' };
    const result = await controller.submit(
      'contact',
      body as any,
      undefined,
      makeReq(),
    );
    expect(result).toEqual({ ok: true });
    expect(service.submit).toHaveBeenCalledWith(
      'contact',
      body,
      null,
      '127.0.0.1',
      'jest',
    );
  });

  it('throws 422 when ZodValidationPipe rejects body (service layer)', async () => {
    service.submit.mockRejectedValue(new UnprocessableEntityException('bad'));
    await expect(
      controller.submit(
        'contact',
        { name: '', email: '' } as any,
        undefined,
        makeReq(),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('propagates NotFoundException for unknown formKey', async () => {
    service.submit.mockRejectedValue(new NotFoundException('Unknown form'));
    await expect(
      controller.submit(
        'foobar',
        { name: 'A', email: 'a@b.com' } as any,
        undefined,
        makeReq(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('passes file to service when provided', async () => {
    const file: Express.Multer.File = {
      buffer: Buffer.from('bytes'),
      mimetype: 'image/png',
      originalname: 'photo.png',
    } as any;
    const body = { name: 'Alice', email: 'a@example.com' };
    await controller.submit('contact', body as any, file, makeReq());
    expect(service.submit).toHaveBeenCalledWith(
      'contact',
      body,
      file,
      '127.0.0.1',
      'jest',
    );
  });

  it('list() delegates to FormsService.list with parsed query params', async () => {
    const result = await controller.list('NEW', undefined, '10', '0', 'asc');
    expect(service.list).toHaveBeenCalledWith({
      status: 'NEW',
      spam: false,
      take: 10,
      skip: 0,
      order: 'asc',
    });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('list() maps ?spam=1 to the spam view', async () => {
    await controller.list(undefined, '1', undefined, undefined, undefined);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ spam: true }),
    );
  });

  it('list() passes undefined take/skip/order when query params absent', async () => {
    await controller.list(undefined, undefined, undefined, undefined, undefined);
    expect(service.list).toHaveBeenCalledWith({
      status: undefined,
      spam: false,
      take: undefined, // controller guards: take !== undefined before parseInt
      skip: undefined,
      order: undefined,
    });
  });

  it('clearSpam() delegates to FormsService.clearSpam', async () => {
    const result = await controller.clearSpam();
    expect(service.clearSpam).toHaveBeenCalled();
    expect(result).toEqual({ deleted: 0 });
  });

  it('summary() returns service.summary result', async () => {
    const result = await controller.summary();
    expect(service.summary).toHaveBeenCalled();
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('series');
  });

  it('get() delegates to FormsService.get with the id', async () => {
    const result = await controller.get('sub_1');
    expect(service.get).toHaveBeenCalledWith('sub_1');
    expect(result).toHaveProperty('upload');
  });
});
