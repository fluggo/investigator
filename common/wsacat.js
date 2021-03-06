// Cisco WSA category data, see http://www.cisco.com/c/dam/en/us/td/docs/security/wsa/wsa9-0/WSA_9-0-0_UserGuide.pdf

/*
id: 
name: 
code: 
description: 
examples: 
*/

var categories = [
  {
    id: 'adlt',
    name: 'Adult',
    code: 1006,
    description: 'Directed at adults, but not necessarily pornographic. May include adult clubs (strip clubs, swingers clubs, escort services, strippers); general information about sex, non-pornographic in nature; genital piercing; adult products or greeting cards; information about sex not in the context of health or disease.',
    examples: ['www.adultentertainmentexpo.com', 'www.adultnetline.com'],
  },
  {
    id: 'adv',
    name: 'Advertisements',
    code: 1027,
    description: 'Banner and pop-up advertisements that often accompany a web page; other advertising websites that provide advertisement content. Advertising services and sales are classified as “Business and Industry.”',
    examples: ['www.adforce.com', 'www.doubleclick.com'],
  },
  {
    id: 'alc',
    name: 'Alcohol',
    code: 1077,
    description: 'Alcohol as a pleasurable activity; beer and wine making, cocktail recipes; liquor sellers, wineries, vineyards, breweries, alcohol distributors. Alcohol addiction is classified as “Health and Nutrition.” Bars and restaurants are classified as “Dining and Drinking.”',
    examples: ['www.samueladams.com', 'www.whisky.com'],
  },
  {
    id: 'art',
    name: 'Arts',
    code: 1002,
    description: 'Galleries and exhibitions; artists and art; photography; literature and books; performing arts and theater; musicals; ballet; museums; design; architecture. Cinema and television are classified as “Entertainment.”',
    examples: ['www.moma.org', 'www.nga.gov'],
  },
  {
    id: 'astr',
    name: 'Astrology',
    code: 1074,
    description: 'Astrology; horoscope; fortune telling; numerology; psychic advice; tarot.',
    examples: ['www.astro.com', 'www.astrology.com'],
  },
  {
    id: 'auct',
    name: 'Auctions',
    code: 1088,
    description: 'Online and offline auctions, auction houses, and classified advertisements.',
    examples: ['www.craigslist.com', 'www.ebay.com'],
  },
  {
    id: 'busi',
    name: 'Business and Industry',
    code: 1019,
    description: 'Marketing, commerce, corporations, business practices, workforce, human resources, transportation, payroll, security and venture capital; office supplies; industrial equipment (process equipment), machines and mechanical systems; heating equipment, cooling equipment; materials handling equipment; packaging equipment; manufacturing: solids handling, metal fabrication, construction and building; passenger transportation; commerce; industrial design; construction, building materials; shipping and freight (freight services, trucking, freight forwarders, truckload carriers, freight and transportation brokers, expedited services, load and freight matching, track and trace, rail shipping, ocean shipping, road feeder services, moving and storage).',
    examples: ['www.freightcenter.com', 'www.staples.com'],
  },
  {
    id: 'chat',
    name: 'Chat and Instant Messaging',
    code: 1040,
    description: 'Web-based instant messaging and chat rooms.',
    examples: ['www.icq.com', 'www.meebo.com'],
  },
  {
    id: 'plag',
    name: 'Cheating and Plagiarism',
    code: 1051,
    description: 'Promoting cheating and selling written work, such as term papers, for plagiarism.',
    examples: ['www.bestessays.com', 'www.superiorpapers.com'],
  },
  {
    id: 'cprn',
    name: 'Child Abuse Content',
    code: 1064,
    description: 'Worldwide illegal child sexual abuse content.',
  },
  {
    id: 'csec',
    name: 'Computer Security',
    code: 1065,
    description: 'Offering security products and services for corporate and home users.',
    examples: ['www.computersecurity.com', 'www.symantec.com'],
  },
  {
    id: 'comp',
    name: 'Computers and Internet',
    code: 1003,
    description: 'Information about computers and software, such as hardware, software, software support; information for software engineers, programming and networking; website design; the web and Internet in general; computer science; computer graphics and clipart. “Freeware and Shareware” is a separate category.',
    examples: ['www.xml.com', 'www.w3.org'],
  },
  {
    id: 'date',
    name: 'Dating',
    code: 1055,
    description: 'Dating, online personals, matrimonial agencies.',
    examples: ['www.eharmony.com', 'www.match.com'],
  },
  {
    id: 'card',
    name: 'Digital Postcards',
    code: 1082,
    description: 'Enabling sending of digital postcards and e-cards.',
    examples: ['www.all-yours.net', 'www.delivr.net'],
  },
  {
    id: 'food',
    name: 'Dining and Drinking',
    code: 1061,
    description: 'Eating and drinking establishments; restaurants, bars, taverns, and pubs; restaurant guides and reviews.',
    examples: ['www.hideawaybrewpub.com', 'www.restaurantrow.com'],
  },
  {
    id: 'dyn',
    name: 'Dynamic and Residential',
    code: 1091,
    description: 'IP addresses of broadband links that usually indicates users attempting to access their home network, for example for a remote session to a home computer.',
    examples: ['http://109.60.192.55', 'http://dynalink.co.jp', 'http://ipadsl.net'],
  },
  {
    id: 'edu',
    name: 'Education',
    code: 1001,
    description: 'Education-related, such as schools, colleges, universities, teaching materials, and teachers’ resources; technical and vocational training; online training; education issues and policies; financial aid; school funding; standards and testing.',
    examples: ['www.education.com', 'www.greatschools.org'],
  },
  {
    id: 'ent',
    name: 'Entertainment',
    code: 1093,
    description: 'Details or discussion of films; music and bands; television; celebrities and fan websites; entertainment news; celebrity gossip; entertainment venues. Compare with the “Arts” category.',
    examples: ['www.eonline.com', 'www.ew.com'],
  },
  {
    id: 'extr',
    name: 'Extreme',
    code: 1075,
    description: 'Material of a sexually violent or criminal nature; violence and violent behavior; tasteless, often gory photographs, such as autopsy photos; photos of crime scenes, crime and accident victims; excessive obscene material; shock websites.',
    examples: ['www.car-accidents.com', 'www.crime-scene-photos.com'],
  },
  {
    id: 'fash',
    name: 'Fashion',
    code: 1076,
    description: 'Clothing and fashion; hair salons; cosmetics; accessories; jewelry; perfume; pictures and text relating to body modification; tattoos and piercing; modeling agencies. Dermatological products are classified as “Health and Nutrition.”',
    examples: ['www.fashion.net', 'www.findabeautysalon.com'],
  },
  {
    id: 'fts',
    name: 'File Transfer Services',
    code: 1071,
    description: 'File transfer services with the primary purpose of providing download services and hosted file sharing.',
    examples: ['www.rapidshare.com', 'www.yousendit.com'],
  },
  {
    id: 'filt',
    name: 'Filter Avoidance',
    code: 1025,
    description: 'Promoting and aiding undetectable and anonymous web usage, including cgi, php and glype anonymous proxy services.',
    examples: ['www.bypassschoolfilter.com', 'www.filterbypass.com'],
  },
  {
    id: 'fnnc',
    name: 'Finance',
    code: 1015,
    description: 'Primarily financial in nature, such as accounting practices and accountants, taxation, taxes, banking, insurance, investing, the national economy, personal finance involving insurance of all types, credit cards, retirement and estate planning, loans, mortgages. Stock and shares are classified as “Online Trading.”',
    examples: ['finance.yahoo.com', 'www.bankofamerica.com'],
  },
  {
    id: 'free',
    name: 'Freeware and Shareware',
    code: 1068,
    description: 'Providing downloads of free and shareware software.',
    examples: ['www.freewarehome.com', 'www.shareware.com'],
  },
  {
    id: 'gamb',
    name: 'Gambling',
    code: 1049,
    description: 'Casinos and online gambling; bookmakers and odds; gambling advice; competitive racing in a gambling context; sports booking; sports gambling; services for spread betting on stocks and shares. Websites dealing with gambling addiction are classified as “Health and Nutrition.” Government-run lotteries are classified as “Lotteries”.',
    examples: ['www.888.com', 'www.gambling.com'],
  },
  {
    id: 'game',
    name: 'Games',
    code: 1007,
    description: 'Various card games, board games, word games, and video games; combat games; sports games; downloadable games; game reviews; cheat sheets; computer games and Internet games, such as role-playing games.',
    examples: ['www.games.com', 'www.shockwave.com'],
  },
  {
    id: 'gov',
    name: 'Government and Law',
    code: 1011,
    description: 'Government websites; foreign relations; news and information relating to government and elections; information relating to the field of law, such as attorneys, law firms, law publications, legal reference material, courts, dockets, and legal associations; legislation and court decisions; civil rights issues; immigration; patents and copyrights; information relating to law enforcement and correctional systems; crime reporting, law enforcement, and crime statistics; military, such as the armed forces, military bases, military organizations; anti-terrorism.',
    examples: ['www.usa.gov', 'www.law.com'],
  },
  {
    id: 'hack',
    name: 'Hacking',
    code: 1050,
    description: 'Discussing ways to bypass the security of websites, software, and computers.',
    examples: ['www.hackthissite.org', 'www.gohacking.com'],
  },
  {
    id: 'hate',
    name: 'Hate Speech',
    code: 1016,
    description: 'Websites promoting hatred, intolerance, or discrimination on the basis of social group, color, religion, sexual orientation, disability, class, ethnicity, nationality, age, gender, gender identity; sites promoting racism; sexism; racist theology; hate music; neo-Nazi organizations; supremacism; Holocaust denial.',
    examples: ['www.kkk.com', 'www.nazi.org'],
  },
  {
    id: 'hlth',
    name: 'Health and Nutrition',
    code: 1009,
    description: 'Health care; diseases and disabilities; medical care; hospitals; doctors; medicinal drugs; mental health; psychiatry; pharmacology; exercise and fitness; physical disabilities; vitamins and supplements; sex in the context of health (disease and health care); tobacco use, alcohol use, drug use, and gambling in the context of health (disease and health care); food in general; food and beverage; cooking and recipes; food and nutrition, health, and dieting; cooking, including recipe and culinary websites; alternative medicine.',
    examples: ['www.health.com', 'www.webmd.com'],
  },
  {
    id: 'lol',
    name: 'Humor',
    code: 1079,
    description: 'Jokes, sketches, comics and other humorous content. Adult humor likely to offend is classified as “Adult.”',
    examples: ['www.humor.com', 'www.jokes.com'],
  },
  {
    id: 'ilac',
    name: 'Illegal Activities',
    code: 1022,
    description: 'Promoting crime, such as stealing, fraud, illegally accessing telephone networks; computer viruses; terrorism, bombs, and anarchy; websites depicting murder and suicide as well as explaining ways to commit them.',
    examples: ['www.ekran.no', 'www.thedisease.net'],
  },
  {
    id: 'ildl',
    name: 'Illegal Downloads',
    code: 1084,
    description: 'Providing the ability to download software or other materials, serial numbers, key generators, and tools for bypassing software protection in violation of copyright agreements. Torrents are classified as “Peer File Transfer.”',
    examples: ['www.keygenguru.com', 'www.zcrack.com'],
  },
  {
    id: 'drug',
    name: 'Illegal Drugs',
    code: 1047,
    description: 'Information about recreational drugs, drug paraphernalia, drug purchase and manufacture.',
    examples: ['www.cocaine.org', 'www.hightimes.com'],
  },
  {
    id: 'infr',
    name: 'Infrastructure and Content Delivery Networks',
    code: 1018,
    description: 'Content delivery infrastructure and dynamically generated content; websites that cannot be classified more specifically because they are secured or otherwise difficult to classify.',
    examples: ['www.akamai.net', 'www.webstat.net'],
  },
  {
    id: 'voip',
    name: 'Internet Telephony',
    code: 1067,
    description: 'Telephonic services using the Internet.',
    examples: ['www.evaphone.com', 'www.skype.com'],
  },
  {
    id: 'job',
    name: 'Job Search',
    code: 1004,
    description: 'Career advice; resume writing and interviewing skills; job placement services; job databanks; permanent and temporary employment agencies; employer websites.',
    examples: ['www.careerbuilder.com', 'www.monster.com'],
  },
  {
    id: 'ling',
    name: 'Lingerie and Swimsuits',
    code: 1031,
    description: 'Intimate apparel and swimwear, especially when modeled.',
    examples: ['www.swimsuits.com', 'www.victoriassecret.com'],
  },
  {
    id: 'lotr',
    name: 'Lotteries',
    code: 1034,
    description: 'Sweepstakes, contests and state-sponsored lotteries.',
    examples: ['www.calottery.com', 'www.flalottery.com'],
  },
  {
    id: 'cell',
    name: 'Mobile Phones',
    code: 1070,
    description: 'Short Message Services (SMS); ringtones and mobile phone downloads. Cellular carrier websites are included in the “Business and Industry” category.',
    examples: ['www.cbfsms.com', 'www.zedge.net'],
  },
  {
    id: 'natr',
    name: 'Nature',
    code: 1013,
    description: 'Natural resources; ecology and conservation; forests; wilderness; plants; flowers; forest conservation; forest, wilderness, and forestry practices; forest management (reforestation, forest protection, conservation, harvesting, forest health, thinning, and prescribed burning); agricultural practices (agriculture, gardening, horticulture, landscaping, planting, weed control, irrigation, pruning, and harvesting); pollution issues (air quality, hazardous waste, pollution prevention, recycling, waste management, water quality, and the environmental cleanup industry); animals, pets, livestock, and zoology; biology; botany.',
    examples: ['www.enature.com', 'www.nature.org'],
  },
  {
    id: 'news',
    name: 'News',
    code: 1058,
    description: 'News; headlines; newspapers; television stations; magazines; weather; ski conditions.',
    examples: ['www.cnn.com', 'news.bbc.co.uk'],
  },
  {
    id: 'ngo',
    name: 'Non-Governmental Organizations',
    code: 1087,
    description: 'Non-governmental organizations such as clubs, lobbies, communities, non-profit organizations and labor unions.',
    examples: ['www.panda.org', 'www.unions.org'],
  },
  {
    id: 'nsn',
    name: 'Non-Sexual Nudity',
    code: 1060,
    description: 'Nudism and nudity; naturism; nudist camps; artistic nudes.',
    examples: ['www.artenuda.com', 'www.naturistsociety.com'],
  },
  {
    id: 'comm',
    name: 'Online Communities',
    code: 1024,
    description: 'Affinity groups; special interest groups; web newsgroups; message boards. Excludes websites classified as “Professional Networking” or “Social Networking.”',
    examples: ['www.igda.org', 'www.ieee.org'],
  },
  {
    id: 'osb',
    name: 'Online Storage and Backup',
    code: 1066,
    description: 'Offsite and peer-to-peer storage for backup, sharing, and hosting.',
    examples: ['www.adrive.com', 'www.dropbox.com'],
  },
  {
    id: 'trad',
    name: 'Online Trading',
    code: 1028,
    description: 'Online brokerages; websites that enable the user to trade stocks online; information relating to the stock market, stocks, bonds, mutual funds, brokers, stock analysis and commentary, stock screens, stock charts, IPOs, stock splits. Services for spread betting on stocks and shares are classified as “Gambling.” Other financial services are classified as “Finance.”',
    examples: ['www.tdameritrade.com', 'www.scottrade.com'],
  },
  {
    id: 'pem',
    name: 'Organizational Email',
    code: 1085,
    description: 'Websites used to access business email (often via Outlook Web Access).',
  },
  {
    id: 'park',
    name: 'Parked Domains',
    code: 1092,
    description: 'Websites that monetize traffic from the domain using paid listings from an ad network, or are owned by “squatters” hoping to sell the domain name for a profit. These also include fake search websites which return paid ad links.',
    examples: ['www.domainzaar.com', 'www.parked.com'],
  },
  {
    id: 'p2p',
    name: 'Peer File Transfer',
    code: 1056,
    description: 'Peer-to-peer file request websites. This does not track the file transfers themselves.',
    examples: ['www.bittorrent.com', 'www.limewire.com'],
  },
  {
    id: 'pers',
    name: 'Personal Sites',
    code: 1081,
    description: 'Websites about and from private individuals; personal homepage servers; websites with personal contents; personal blogs with no particular theme.',
    examples: ['www.karymullis.com', 'www.stallman.org'],
  },
  {
    id: 'img',
    name: 'Photo Searches and Images',
    code: 1090,
    description: 'Facilitating the storing and searching for, images, photographs, and clip-art.',
    examples: ['www.flickr.com', 'www.photobucket.com'],
  },
  {
    id: 'pol',
    name: 'Politics',
    code: 1083,
    description: 'Websites of politicians; political parties; news and information on politics, elections, democracy, and voting.',
    examples: ['www.politics.com', 'www.thisnation.com'],
  },
  {
    id: 'porn',
    name: 'Pornography',
    code: 1054,
    description: 'Sexually explicit text or depictions. Includes explicit anime and cartoons; general explicit depictions; other fetish material; explicit chat rooms; sex simulators; strip poker; adult movies; lewd art; web-based explicit email.',
    examples: ['www.redtube.com', 'www.youporn.com'],
  },
  {
    id: 'pnet',
    name: 'Professional Networking',
    code: 1089,
    description: 'Social networking for the purpose of career or professional development. See also “Social Networking.”',
    examples: ['www.linkedin.com', 'www.europeanpwn.net'],
  },
  {
    id: 'rest',
    name: 'Real Estate',
    code: 1045,
    description: 'Information that would support the search for real estate; office and commercial space; real estate listings, such as rentals, apartments, and homes; house building.',
    examples: ['www.realtor.com', 'www.zillow.com'],
  },
  {
    id: 'ref',
    name: 'Reference',
    code: 1017,
    description: 'City and state guides; maps, time; reference sources; dictionaries; libraries.',
    examples: ['www.wikipedia.org', 'www.yellowpages.com'],
  },
  {
    id: 'rel',
    name: 'Religion',
    code: 1086,
    description: 'Religious content, information about religions; religious communities.',
    examples: ['www.religionfacts.com', 'www.religioustolerance.org'],
  },
  {
    id: 'saas',
    name: 'SAAS and B2B',
    code: 1080,
    description: 'Web portals for online business services; online meetings.',
    examples: ['www.netsuite.com', 'www.salesforce.com'],
  },
  {
    id: 'kids',
    name: 'Safe for Kids',
    code: 1057,
    description: 'Directed at, and specifically approved for, young children.',
    examples: ['kids.discovery.com', 'www.nickjr.com'],
  },
  {
    id: 'sci',
    name: 'Science and Technology',
    code: 1012,
    description: 'Science and technology, such as aerospace, electronics, engineering, mathematics, and other similar subjects; space exploration; meteorology; geography; environment; energy (fossil, nuclear, renewable); communications (telephones, telecommunications).',
    examples: ['www.physorg.com', 'www.science.gov'],
  },
  {
    id: 'srch',
    name: 'Search Engines and Portals',
    code: 1020,
    description: 'Search engines and other initial points of access to information on the Internet.',
    examples: ['www.bing.com', 'www.google.com'],
  },
  {
    id: 'sxed',
    name: 'Sex Education',
    code: 1052,
    description: 'Factual websites dealing with sex; sexual health; contraception; pregnancy.',
    examples: ['www.avert.org', 'www.scarleteen.com'],
  },
  {
    id: 'shop',
    name: 'Shopping',
    code: 1005,
    description: 'Bartering; online purchasing; coupons and free offers; general office supplies; online catalogs; online malls.',
    examples: ['www.amazon.com', 'www.shopping.com'],
  },
  {
    id: 'snet',
    name: 'Social Networking',
    code: 1069,
    description: 'Social networking. See also “Professional Networking.”',
    examples: ['www.facebook.com', 'www.twitter.com'],
  },
  {
    id: 'socs',
    name: 'Social Science',
    code: 1014,
    description: 'Sciences and history related to society; archaeology; anthropology; cultural studies; history; linguistics; geography; philosophy; psychology; women\'s studies.',
    examples: ['www.archaeology.org', 'www.anthropology.net'],
  },
  {
    id: 'scty',
    name: 'Society and Culture',
    code: 1010,
    description: 'Family and relationships; ethnicity; social organizations; genealogy; seniors; child-care.',
    examples: ['www.childcare.gov', 'www.familysearch.org'],
  },
  {
    id: 'swup',
    name: 'Software Updates',
    code: 1053,
    description: 'Websites that host updates for software packages.',
    examples: ['www.softwarepatch.com', 'www.versiontracker.com'],
  },
  {
    id: 'sprt',
    name: 'Sports and Recreation',
    code: 1008,
    description: 'All sports, professional and amateur; recreational activities; fishing; fantasy sports; public parks; amusement parks; water parks; theme parks; zoos and aquariums; spas.',
    examples: ['www.espn.com', 'www.recreation.gov'],
  },
  {
    id: 'aud',
    name: 'Streaming Audio',
    code: 1073,
    description: 'Real-time streaming audio content including Internet radio and audio feeds.',
    examples: ['www.live-radio.net', 'www.shoutcast.com'],
  },
  {
    id: 'vid',
    name: 'Streaming Video',
    code: 1072,
    description: 'Real-time streaming video including Internet television, web casts, and video sharing.',
    examples: ['www.hulu.com', 'www.youtube.com'],
  },
  {
    id: 'tob',
    name: 'Tobacco',
    code: 1078,
    description: 'Pro-tobacco websites; tobacco manufacturers; pipes and smoking products (not marketed for illegal drug use). Tobacco addiction is classified as “Health and Nutrition.”',
    examples: ['www.bat.com', 'www.tobacco.org'],
  },
  {
    id: 'trns',
    name: 'Transportation',
    code: 1044,
    description: 'Personal transportation; information about cars and motorcycles; shopping for new and used cars and motorcycles; car clubs; boats, airplanes, recreational vehicles (RVs), and other similar items. Note, car and motorcycle racing is classified as “Sports and Recreation.”',
    examples: ['www.cars.com', 'www.motorcycles.com'],
  },
  {
    id: 'trvl',
    name: 'Travel',
    code: 1046,
    description: 'Business and personal travel; travel information; travel resources; travel agents; vacation packages; cruises; lodging and accommodation; travel transportation; flight booking; airfares; car rental; vacation homes.',
    examples: ['www.expedia.com', 'www.lonelyplanet.com'],
  },

    /*Unclassified — — Websites which are not in the Cisco database are
    recorded as unclassified for reporting purposes. This
    may include mistyped URLs.
    —*/

  {
    id: 'weap',
    name: 'Weapons',
    code: 1036,
    description: 'Information relating to the purchase or use of conventional weapons such as gun sellers, gun auctions, gun classified ads, gun accessories, gun shows, and gun training; general information about guns; other weapons and graphic hunting sites may be included. Government military websites are classified as “Government and Law.”',
    examples: ['www.coldsteel.com', 'www.gunbroker.com'],
  },
  {
    id: 'whst',
    name: 'Web Hosting',
    code: 1037,
    description: 'Website hosting; bandwidth services.',
    examples: ['www.bluehost.com', 'www.godaddy.com'],
  },
  {
    id: 'tran',
    name: 'Web Page Translation',
    code: 1063,
    description: 'Translation of web pages between languages.',
    examples: ['babelfish.yahoo.com', 'translate.google.com'],
  },
  {
    id: 'mail',
    name: 'Web-Based Email',
    code: 1038,
    description: 'Public web-based email services. Websites enabling individuals to access their company or organization’s email service are classified as “Organizational Email.”',
    examples: ['mail.yahoo.com', 'www.hotmail.com'],
  },
];

module.exports = categories;
