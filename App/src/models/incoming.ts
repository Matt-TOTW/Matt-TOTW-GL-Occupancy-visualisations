type RatePlanPropName = `ratePlan_${string}`;
type RoomTypePropName = `roomType_${string}`;
type SitePropName = `site_${string}`;

type DayItemBasics = {
  day: number;
  dayStr: string;
  occTotal: number;
};

type RatePlanItem = {
  [ratePlan: RatePlanPropName]: number;
};

type RoomTypeItem = {
  [roomType: RoomTypePropName]: number;
};

export type Sites = {
  [site: SitePropName]: {
    allRatePlans: number;
  } & Partial<RatePlanItem & RoomTypeItem>;
};

export type PickupItem = DayItemBasics & RatePlanItem & RoomTypeItem & Sites;

export type Booking = DayItemBasics &
  Partial<RatePlanItem & RoomTypeItem> &
  Sites & {
    pickup: PickupItem[];
  };

type SiteMaxs = {
  [site: string]: {
    allRatePlans: {
      max: number;
    };
    [ratePlan: RatePlanPropName]: {
      max: number;
    };
    // [roomType: RoomTypePropName]: {
    //   max: number;
    // };
  };
};

export type IncomingData = {
  bookings: Booking[];
  sites: SiteMaxs;
};
