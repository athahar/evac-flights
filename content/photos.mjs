// Real location photography. All sources checked against the Unsplash License.
const photo=(src,width,height,caption,credit,id,position='50% 50%')=>({src,width,height,alt:caption,caption,credit,url:`https://unsplash.com/photos/${id}`,position});
export const pictures={
 skyline:photo('dubai-david-rodrigo.jpg',1800,1200,'Burj Khalifa and Downtown Dubai','David Rodrigo','Fr6zexbmjmc','50% 10%'),
 creek:photo('dubai-creek.jpg',1000,667,'The waterfront at Dubai Creek','Jack Sparrow','jiWSlJ-NYwY'),
 mosque:photo('abu-dhabi-mosque.jpg',1400,934,'Sheikh Zayed Grand Mosque, Abu Dhabi','David Rodrigo','kZ1zThg6G40'),
 desert:photo('liwa-dunes.jpg',1400,933,'Desert accommodation among the dunes of Liwa','Artur Matosyan','tdsVtzWp1pA'),
 marina:photo('dubai-marina.jpg',1400,933,'Boats and waterfront towers in Dubai Marina','Nelemson Guevarra','w1fNR1LYJHQ'),
 sharjah:photo('sharjah-heritage.jpg',1400,2100,'Sharjah Heritage Museum courtyard','Miguel Joya','kHi1cMPuH0o'),
 jais:photo('jebel-jais.jpg',1400,2100,'Mountain ridges at Jebel Jais, Ras Al Khaimah','sohel yousuf','SbX0QwZoyyU'),
 fujairah:photo('fujairah-fort.jpg',1400,2104,'The walls of Fujairah Fort','Julius Yls','cF-ElZjmhQk'),
 hatta:photo('hatta-dam.jpg',1400,933,'Kayaks on Hatta Dam beneath the mountains','sohel yousuf','v66l2Q1mXmo'),
 uaq:photo('umm-al-quwain-beach.jpg',1400,1999,'A walk on the beach in Umm Al Quwain','Salman Sidheek','OmzXnSWk3ZA','50% 72%'),
 alain:photo('al-ain.jpg',1400,2100,'Fort architecture in Al Ain','Saj Shafique','6dhPDQaFFVc','50% 65%'),
 palm:photo('palm-jumeirah.jpg',1400,933,'Palm Jumeirah’s shoreline','Nelemson Guevarra','yOSMn_kpWLs'),
 mleiha:photo('mleiha-camel.jpg',1400,933,'A camel among the dunes at Mleiha, Sharjah','AHMAD BADER','8h3umJ6mFKs'),
 rafisah:photo('al-rafisah.jpg',1400,1867,'Al Rafisah Dam near Khorfakkan','Muneeb Muhamed','HclguKUVVvE','50% 65%'),
 future:photo('museum-future.jpg',1400,974,'The exterior of Museum of the Future, Dubai','Hariskhan','oF7dZYCgO3k'),
 frame:photo('dubai-frame.jpg',1400,2100,'Looking up at Dubai Frame','Nick Fewings','8qwT7b7KZ5c'),
 ajman:photo('ajman-shore.jpg',1400,933,'Beach umbrellas along the Ajman coast','Dovlet Hojayev','s-rLDfZIhuc'),
 louvre:photo('louvre-abu-dhabi.jpg',1400,933,'Louvre Abu Dhabi on Saadiyat Island','Nick Fewings','hVgZunLYiTA'),
 yas:photo('yas-ferrari.jpg',1400,2100,'Inside Ferrari World on Yas Island','Dmitry Kropachev','0f7saqvyojY','50% 78%')
};
export const heroPhotos={
 'best-time-to-visit-dubai':'marina','dubai-airport-to-city':'skyline','dubai-layover-guide':'creek','where-to-stay-in-dubai':'marina','dubai-first-time-itinerary':'creek','dubai-sim-esim':'skyline','dubai-airports-guide':'skyline',
 'burj-khalifa-visit':'skyline','dubai-mall-guide':'skyline','dubai-marina-jbr':'marina','palm-jumeirah-guide':'palm','dubai-frame-guide':'frame','museum-of-the-future-guide':'future','old-dubai-souks':'creek','dubai-desert-safari-guide':'mleiha','al-marmoom-camel-racing':'mleiha','hatta-day-trip':'hatta',
 'abu-dhabi-city-guide':'mosque','yas-island-guide':'yas','abu-dhabi-islands-guide':'louvre','al-ain-guide':'alain','liwa-desert-guide':'desert','sharjah-city-guide':'sharjah','mleiha-desert-guide':'mleiha','khorfakkan-shees-guide':'rafisah','uae-wadis-guide':'hatta','ras-al-khaimah-guide':'jais','ajman-guide':'ajman','umm-al-quwain-guide':'uaq','fujairah-guide':'fujairah',
 'dubai-5-day-itinerary':'skyline','dubai-7-day-itinerary':'mosque','uae-2-week-itinerary':'jais'
};
export const inlinePhotos={
 'where-to-stay-in-dubai':{shortlist:'creek','match-trip':'palm'},
 'dubai-first-time-itinerary':{downtown:'skyline',waterfront:'marina'},
 'dubai-5-day-itinerary':{'day-1':'creek','day-3':'marina','day-5':'mleiha'},
 'dubai-7-day-itinerary':{dubai:'marina','day-7':'louvre'},
 'uae-2-week-itinerary':{'abu-dhabi':'mosque','al-ain':'alain','east-coast':'rafisah',coast:'ajman'},
 'abu-dhabi-city-guide':{museum:'louvre'},'abu-dhabi-islands-guide':{farther:'yas'},
 'ras-al-khaimah-guide':{heritage:'jais'},'dubai-desert-safari-guide':{alternatives:'desert'}
};
export const regionPhotos={'Dubai':'marina','Abu Dhabi':'mosque','Sharjah':'sharjah','Ras Al Khaimah':'jais','Ajman':'ajman','Umm Al Quwain':'uaq','Fujairah':'fujairah','Across the UAE':'hatta'};
