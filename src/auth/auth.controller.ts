import { Controller, Get, HttpCode, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, SignupDto } from './dto/auth.dto';
import { OptionalAuth, Public } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('signup')
  signup(@Body() body: SignupDto) {
    return this.auth.signupRequester(body);
  }

  @Public()
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.loginRequester(body);
  }

  @Public()
  @Post('ops/login')
  loginOps(@Body() body: LoginDto) {
    return this.auth.loginOps(body);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout() {
    return;
  }

  @OptionalAuth()
  @Get('session')
  getSession(@CurrentUser() user: AuthUser | null, @Res() res: Response) {
    res.status(200).json(this.auth.getSession(user));
  }

  @OptionalAuth()
  @Get('me')
  async getMe(@CurrentUser() user: AuthUser | null, @Res() res: Response) {
    res.status(200).json(await this.auth.getCurrentUser(user));
  }

  @OptionalAuth()
  @Get('ops/me')
  async getOpsMe(@CurrentUser() user: AuthUser | null, @Res() res: Response) {
    res.status(200).json(await this.auth.getCurrentOpsUser(user));
  }
}
