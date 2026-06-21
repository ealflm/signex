import { Test, TestingModule } from '@nestjs/testing';
import {
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

describe('FormsController', () => {
  let controller: FormsController;
  let service: { submit: jest.Mock };

  beforeEach(async () => {
    service = { submit: jest.fn().mockResolvedValue({ ok: true }) };

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
    await controller.submit('quote', body as any, file, makeReq());
    expect(service.submit).toHaveBeenCalledWith(
      'quote',
      body,
      file,
      '127.0.0.1',
      'jest',
    );
  });
});
