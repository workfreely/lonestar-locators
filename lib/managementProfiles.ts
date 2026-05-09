export const MANAGEMENT_PROFILES: Record<
  string,
  {
    flexibleLowCredit: boolean
    flexibleBrokenLease: boolean
    flexibleEviction: boolean
    strictFelony: boolean
  }
> = {
  Embrey: {
    flexibleLowCredit: true,
    flexibleBrokenLease: true,
    flexibleEviction: false,
    strictFelony: true,
  },

  "Churchill Forge": {
    flexibleLowCredit: true,
    flexibleBrokenLease: true,
    flexibleEviction: false,
    strictFelony: true,
  },

  "Capstone": {
    flexibleLowCredit: true,
    flexibleBrokenLease: true,
    flexibleEviction: false,
    strictFelony: true,
  },

  "Management Support": {
    flexibleLowCredit: true,
    flexibleBrokenLease: true,
    flexibleEviction: true,
    strictFelony: false,
  },

  Tipton: {
    flexibleLowCredit: true,
    flexibleBrokenLease: false,
    flexibleEviction: false,
    strictFelony: true,
  },

  "Willow Bridge": {
    flexibleLowCredit: true,
    flexibleBrokenLease: false,
    flexibleEviction: false,
    strictFelony: true,
  },
}