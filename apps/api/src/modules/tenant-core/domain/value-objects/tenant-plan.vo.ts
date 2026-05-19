import { ValueObject } from '@atlas/shared-kernel';
import { TenantPlanTier } from '@atlas/shared-kernel';

interface TenantPlanProps {
  tier: TenantPlanTier;
  maxProjects: number;
  maxMembers: number;
  maxApiKeys: number;
  auditRetentionDays: number;
}

const PLAN_DEFAULTS: Record<TenantPlanTier, Omit<TenantPlanProps, 'tier'>> = {
  [TenantPlanTier.FREE]: {
    maxProjects: 1,
    maxMembers: 3,
    maxApiKeys: 2,
    auditRetentionDays: 30,
  },
  [TenantPlanTier.STARTER]: {
    maxProjects: 5,
    maxMembers: 10,
    maxApiKeys: 10,
    auditRetentionDays: 90,
  },
  [TenantPlanTier.PRO]: {
    maxProjects: 25,
    maxMembers: 50,
    maxApiKeys: 50,
    auditRetentionDays: 365,
  },
  [TenantPlanTier.ENTERPRISE]: {
    maxProjects: 1000,
    maxMembers: 10000,
    maxApiKeys: 1000,
    auditRetentionDays: 2555,
  },
};

export class TenantPlan extends ValueObject<TenantPlanProps> {
  private constructor(props: TenantPlanProps) {
    super(props);
  }

  static forTier(tier: TenantPlanTier): TenantPlan {
    return new TenantPlan({ tier, ...PLAN_DEFAULTS[tier] });
  }

  get tier(): TenantPlanTier { return this.props.tier; }
  get maxProjects(): number { return this.props.maxProjects; }
  get maxMembers(): number { return this.props.maxMembers; }
  get maxApiKeys(): number { return this.props.maxApiKeys; }
  get auditRetentionDays(): number { return this.props.auditRetentionDays; }

  canAddProject(currentCount: number): boolean {
    return currentCount < this.props.maxProjects;
  }

  canAddMember(currentCount: number): boolean {
    return currentCount < this.props.maxMembers;
  }
}
