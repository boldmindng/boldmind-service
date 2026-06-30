
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
// import { SYSTEM_ROLE_PERMISSIONS } from '@boldmindng/utils';
 
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
 
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
 
    if (!requiredRoles || requiredRoles.length === 0) return true;
 
    const { user } = context.switchToHttp().getRequest<{ user: { role: string; permissions: string[] } }>();
 
    if (!user) throw new ForbiddenException('Authentication required');
 
    // super_admin bypasses all role checks
    if (user.role === 'super_admin') return true;
 
    if (requiredRoles.includes(user.role)) return true;
 
    throw new ForbiddenException(`Role '${user.role}' does not have access to this resource`);
  }
}