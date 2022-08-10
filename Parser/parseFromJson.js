const fs = require('fs');
const { stringify } = require('zipson');
const JSZip = require('jszip');
const { format, addDays } = require('date-fns');

const TRIM_LOWER_BOUND = new Date('2022-01-01').getTime();
const TRIM_UPPER_BOUND = new Date('2023-01-01').getTime();

module.exports = (inputFilepath, outputFilepath) => {
  const roomPicks = JSON.parse(fs.readFileSync(inputFilepath));
  console.log('Here we go then', 'input file:', inputFilepath, 'output file', outputFilepath);
  console.log(`Processing ${roomPicks.length} roomPicks`);

  // const trim = (arr) => {
  //   return arr.filter(({ day }) => {
  //     const dayTime = new Date(day).getTime();

  //     return dayTime > TRIM_LOWER_BOUND && dayTime < TRIM_UPPER_BOUND;
  //   });
  // };

  try {
    let maxTotal = 0;
    const sites = {},
      ratePlans = {},
      roomTypes = {};

    const roomPicksByFromDay = {};
    roomPicks.forEach((booking, progress) => {
      if (!sites[booking.Site]) {
        sites[booking.Site] = { allRatePlans: { max: 0 } };
      }
      if (booking.StatusCode !== 'CAN') {
        booking.RateLines.forEach((rateLine) => {
          const day = rateLine.From.split('T')[0];
          const dayMs = new Date(day).getTime();
          if (dayMs > TRIM_LOWER_BOUND && dayMs < TRIM_UPPER_BOUND) {
            if (!ratePlans[rateLine.RatePlanCode]) {
              ratePlans[rateLine.RatePlanCode] = { max: 0 };
            }
            if (!roomTypes[rateLine.RoomTypeCode]) {
              roomTypes[rateLine.RoomTypeCode] = { max: 0 };
            }

            roomPicksByFromDay[day] = [...(roomPicksByFromDay[day] || []), booking];
          }
        });
      }

      console.log(
        '1/2 progress:',
        `${Math.round(((progress * 100) / roomPicks.length + Number.EPSILON) * 100) / 100}%`
      );
    });

    // Calculate the maxs
    Object.entries(roomPicksByFromDay).forEach(([theDay, arr]) => {
      if (arr.length > maxTotal) maxTotal = arr.length;
      Object.keys(sites).forEach((site) => {
        const count = arr.filter((roomPick) => roomPick.Site === site).length;
        if (count > sites[site].allRatePlans.max) {
          sites[site].allRatePlans.max = count;
          if (site === 'POAKENS') console.log('THE DAY', theDay);
        }
      });
      Object.keys(ratePlans).forEach((ratePlan) => {
        const count = arr.filter((roomPick) =>
          roomPick.RateLines.some((rateLine) => rateLine.RatePlanCode === ratePlan)
        ).length;
        if (count > ratePlans[ratePlan].max) ratePlans[ratePlan].max = count;
        Object.keys(sites).forEach((site) => {
          const countSitePlusRatePlan = arr.filter(
            (roomPick) =>
              roomPick.Site === site &&
              roomPick.RateLines.some((rateLine) => rateLine.RatePlanCode === ratePlan)
          ).length;
          if (!sites[site][`ratePlan_${ratePlan}`])
            sites[site][`ratePlan_${ratePlan}`] = { max: 0 };
          if (countSitePlusRatePlan > sites[site][`ratePlan_${ratePlan}`].max)
            sites[site][`ratePlan_${ratePlan}`].max = countSitePlusRatePlan;
        });
      });
      Object.keys(roomTypes).forEach((roomType) => {
        const count = arr.filter((roomPick) =>
          roomPick.RateLines.some((rateLine) => rateLine.RoomTypeCode === roomType)
        ).length;
        if (count > roomTypes[roomType].max) roomTypes[roomType].max = count;
      });
    });

    const roomPicksByDayLength = Object.keys(roomPicksByFromDay).length;
    const occ = Object.entries(roomPicksByFromDay).map(([fromDay, roomPicks], progress) => {
      const fromDayRoomPicksByCreationDayObj = {};
      roomPicks.forEach((roomPick) => {
        const dateStr = roomPick.CreationDate.split('T')[0];
        fromDayRoomPicksByCreationDayObj[dateStr] = [
          ...(fromDayRoomPicksByCreationDayObj[dateStr] || []),
          roomPick,
        ];
      });

      const fromDayRoomPicksByCreationDayArr = Object.entries(fromDayRoomPicksByCreationDayObj)
        .map(([createdDay, arr]) => {
          const totalBookingsThisDay = arr.length;
          const sitesBookings = {};
          const ratePlansBookings = {};
          const roomTypesBookings = {};
          Object.keys(sites).forEach((site) => {
            const l = arr.filter((roomPick) => roomPick.Site === site).length;
            if (l > 0) {
              if (!sitesBookings[`site_${site}_bookingsThisDay`]) {
                sitesBookings[`site_${site}_bookingsThisDay`] = { allRatePlans: l };
              } else {
                sitesBookings[`site_${site}_bookingsThisDay`].allRatePlans = l;
              }
            }
          });
          Object.keys(ratePlans).forEach((ratePlan) => {
            const l = arr.filter((roomPick) =>
              roomPick.RateLines.some((rateLine) => rateLine.RatePlanCode === ratePlan)
            ).length;
            if (l > 0) ratePlansBookings[`ratePlan_${ratePlan}_bookingsThisDay`] = l;
            Object.keys(sites).forEach((site) => {
              if (sitesBookings[`site_${site}_bookingsThisDay`]) {
                const comboL = arr.filter(
                  (roomPick) =>
                    roomPick.Site === site &&
                    roomPick.RateLines.some((rateLine) => rateLine.RatePlanCode === ratePlan)
                ).length;
                if (!sitesBookings[`site_${site}_bookingsThisDay`][`ratePlan_${ratePlan}`]) {
                  sitesBookings[`site_${site}_bookingsThisDay`][`ratePlan_${ratePlan}`] = comboL;
                } else {
                  if (
                    comboL > sitesBookings[`site_${site}_bookingsThisDay`][`ratePlan_${ratePlan}`]
                  ) {
                    sitesBookings[`site_${site}_bookingsThisDay`][`ratePlan_${ratePlan}`] = comboL;
                  }
                }
              }
            });
          });
          Object.keys(roomTypes).forEach((roomType) => {
            const l = arr.filter((roomPick) =>
              roomPick.RateLines.some((rateLine) => rateLine.RoomTypeCode === roomType)
            ).length;
            if (l > 0) roomTypesBookings[`roomType_${roomType}_bookingsThisDay`] = l;
          });
          return {
            day: createdDay,
            totalBookingsThisDay,
            ...sitesBookings,
            ...ratePlansBookings,
            ...roomTypesBookings,
          };
        })
        .sort((a, b) => {
          const aDate = new Date(a.day).getTime();
          const bDate = new Date(b.day).getTime();
          if (aDate < bDate) {
            return -1;
          } else {
            return 1;
          }
        });

      let runningTotal = {};
      const pickup = fromDayRoomPicksByCreationDayArr.map(
        ({ day, totalBookingsThisDay, ...other }) => {
          const sitesOccupancies = {};
          const ratePlansOccupancies = {};
          const roomTypesOccupancies = {};
          runningTotal.all = (runningTotal.all || 0) + totalBookingsThisDay;

          Object.keys(sites).forEach((site) => {
            if (other[`site_${site}_bookingsThisDay`]) {
              if (!runningTotal[`site_${site}`]) {
                runningTotal[`site_${site}`] = { allRatePlans: 0 };
              }
              runningTotal[`site_${site}`].allRatePlans =
                runningTotal[`site_${site}`].allRatePlans +
                other[`site_${site}_bookingsThisDay`].allRatePlans;

              sitesOccupancies[`site_${site}_total`] = {
                allRatePlans:
                  (100 * runningTotal[`site_${site}`].allRatePlans) / sites[site].allRatePlans.max,
              };
            }
          });
          Object.keys(ratePlans).forEach((ratePlan) => {
            if (other[`ratePlan_${ratePlan}_bookingsThisDay`]) {
              runningTotal[`ratePlan_${ratePlan}`] =
                (runningTotal[`ratePlan_${ratePlan}`] || 0) +
                other[`ratePlan_${ratePlan}_bookingsThisDay`];

              ratePlansOccupancies[`ratePlan_${ratePlan}_total`] =
                (100 * runningTotal[`ratePlan_${ratePlan}`]) / ratePlans[ratePlan].max;
            }
            Object.keys(sites).forEach((site) => {
              if (
                other[`site_${site}_bookingsThisDay`] &&
                other[`site_${site}_bookingsThisDay`][`ratePlan_${ratePlan}`]
              ) {
                runningTotal[`site_${site}`][`ratePlan_${ratePlan}`] =
                  (runningTotal[`site_${site}`][`ratePlan_${ratePlan}`] || 0) +
                  other[`site_${site}_bookingsThisDay`][`ratePlan_${ratePlan}`];

                sitesOccupancies[`site_${site}_total`][`ratePlan_${ratePlan}`] =
                  (100 * runningTotal[`site_${site}`][`ratePlan_${ratePlan}`]) /
                  sites[site][`ratePlan_${ratePlan}`].max;
              }
            });
          });
          Object.keys(roomTypes).forEach((roomType) => {
            if (other[`roomType_${roomType}_bookingsThisDay`]) {
              runningTotal[`roomType_${roomType}`] =
                (runningTotal[`roomType_${roomType}`] || 0) +
                (other[`roomType_${roomType}_bookingsThisDay`] || 0);

              roomTypesOccupancies[`roomType_${roomType}_total`] =
                (100 * runningTotal[`roomType_${roomType}`]) / roomTypes[roomType].max;
            }
          });

          // Object.keys(sites).forEach((site) => {
          //   if (runningTotal[`site_${site}`]) {
          //     sitesOccupancies[`site_${site}_total`] = {
          //       allRatePlans:
          //         (100 * runningTotal[`site_${site}`].allRatePlans) / sites[site].allRatePlans.max,
          //     };
          //   }
          // });
          // Object.keys(ratePlans).forEach((ratePlan) => {
          //   if (runningTotal[`ratePlan_${ratePlan}`]) {
          //     ratePlansOccupancies[`ratePlan_${ratePlan}_total`] =
          //       (100 * runningTotal[`ratePlan_${ratePlan}`]) / ratePlans[ratePlan].max;
          //   }
          //   Object.keys(sites).forEach((site) => {
          //     if (runningTotal[`site_${site}`]) {
          //       sitesOccupancies[`site_${site}_total`][`ratePlan_${ratePlan}`] =
          //         (100 * runningTotal[`site_${site}`][`ratePlan_${ratePlan}`]) /
          //         sites[site][`ratePlan_${ratePlan}`].max;
          //     }
          //   });
          // });
          // Object.keys(roomTypes).forEach((roomType) => {
          //   if (runningTotal[`roomType_${roomType}`]) {
          //     roomTypesOccupancies[`roomType_${roomType}_total`] =
          //       (100 * runningTotal[`roomType_${roomType}`]) / roomTypes[roomType].max;
          //   }
          // });

          return {
            day: new Date(day).getTime(),
            occTotal: (100 * runningTotal.all) / maxTotal,
            ...sitesOccupancies,
            ...ratePlansOccupancies,
            ...roomTypesOccupancies,
          };
        }
      );

      const roomPicksBySite = {};
      const roomPicksByRateCode = {};
      const roomPicksByRooomType = {};
      const roomPicksBySiteAndRateCode = [];
      roomPicks.forEach((roomPick) => {
        roomPicksBySite[roomPick.Site] = [...(roomPicksBySite[roomPick.Site] || []), roomPick];
        roomPick.RateLines.forEach((rateLine) => {
          roomPicksByRateCode[rateLine.RatePlanCode] = [
            ...(roomPicksByRateCode[rateLine.RatePlanCode] || []),
            roomPick,
          ];
          roomPicksByRooomType[rateLine.RoomTypeCode] = [
            ...(roomPicksByRooomType[rateLine.RoomTypeCode] || []),
            roomPick,
          ];
          roomPicksBySiteAndRateCode[`siteRateCode_${roomPick.Site}_${rateLine.RatePlanCode}`] = [
            ...(roomPicksBySiteAndRateCode[
              `siteRateCode_${roomPick.Site}_${rateLine.RatePlanCode}`
            ] || []),
            roomPick,
          ];
        });
      });

      const sitesOccupancies = {};
      const ratePlansOccupancies = {};
      const roomTypesOccupancies = {};
      Object.keys(sites).forEach((site) => {
        sitesOccupancies[`site_${site}`] = {
          allRatePlans: (100 * (roomPicksBySite[site] || []).length) / sites[site].allRatePlans.max,
        };
      });
      Object.keys(ratePlans).forEach((ratePlan) => {
        ratePlansOccupancies[`ratePlan_${ratePlan}`] =
          (100 * (roomPicksByRateCode[ratePlan] || []).length) / ratePlans[ratePlan].max;
        Object.keys(sites).forEach((site) => {
          sitesOccupancies[`site_${site}`][`ratePlan_${ratePlan}`] =
            (100 * (roomPicksBySiteAndRateCode[`siteRateCode_${site}_${ratePlan}`] || []).length) /
            sites[site][`ratePlan_${ratePlan}`].max;
        });
      });
      Object.keys(roomTypes).forEach((roomType) => {
        roomTypesOccupancies[`roomType_${roomType}`] = 0;
        // (100 *
        //   roomPicks.filter((roomPick) =>
        //     roomPick.RateLines.some((rateLine) => rateLine.RoomTypeCode === roomType)
        //   ).length) /
        // roomTypes[roomType].max;
      });

      console.log(
        '2/2 progress:',
        `${Math.round(((progress * 100) / roomPicksByDayLength + Number.EPSILON) * 100) / 100}%`
      );

      return {
        day: new Date(fromDay).getTime(),
        occTotal: (100 * roomPicks.length) / maxTotal,
        ...sitesOccupancies,
        ...ratePlansOccupancies,
        ...roomTypesOccupancies,
        pickup,
      };
    });

    // const trimmed = trim(occ);
    const sorted = occ.sort((a, b) => {
      if (a.day < b.day) {
        return -1;
      } else {
        return 1;
      }
    });

    const addDateStr = sorted.map(({ day: fromDay, pickup, ...rest }) => ({
      day: fromDay,
      dayStr: format(fromDay, 'yyyy-MM-dd'),
      ...rest,
      pickup: pickup.map(({ day: createdDay, ...restPickup }) => ({
        day: createdDay,
        dayStr: format(createdDay, 'yyyy-MM-dd'),
        ...restPickup,
      })),
    }));

    const zip = new JSZip();
    zip.file('parsedZipson.txt', stringify({ bookings: addDateStr, sites, ratePlans, roomTypes }));
    zip
      .generateNodeStream({
        type: 'nodebuffer',
        streamFiles: true,
        compression: 'DEFLATE',
        compressionOptions: {
          level: 9,
        },
      })
      .pipe(fs.createWriteStream(outputFilepath))
      .on('finish', function () {
        // JSZip generates a readable stream with a "end" event,
        // but is piped here in a writable stream which emits a "finish" event.
        console.log(`Zip file written to ${outputFilepath}`);
      });
  } catch (error) {
    console.error(error);
  }
};
