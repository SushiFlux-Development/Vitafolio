import type { GuideContent } from './content'

/**
 * English wording of the guide. The advice is taken from chapter 22 of the manual and its research notes; where a source is
 * named in a text it is the one the manual names. Do not add advice here that the manual does not hold.
 */
export const contentEn: GuideContent = {
  title: 'Guide',
  subtitle: 'Five short questions, then you get an application plan that fits your situation: what belongs in it, how the CV is built and what you can shorten.',
  loading: 'Loading the guide …',
  loadFailed: 'Your saved answers could not be loaded.',
  retry: 'Try again',

  intro: {
    heading: 'The right advice for every situation',
    text: 'Whether you have just left school, have been working for years or are coming back after a break: the guide only shows what applies to you. Your answers are saved in your account, and you can change them at any time.',
    points: ['About one minute', 'Cancel at any time', 'Orientation, not legal advice'],
    start: 'Start the guide',
    overview: 'All situations to read up on',
  },

  wizard: {
    label: 'Guide assistant',
    cancel: 'Cancel',
    back: 'Back',
    next: 'Next',
    finish: 'Create plan',
    finishing: 'Saving …',
    stepOf: (current, total) => `Question ${current} of ${total}`,
    stepFirst: 'Question 1',
    saveFailed: 'Your answers could not be saved.',
    situation: {
      title: 'Where are you right now?',
      hint: 'Choose what fits best.',
      options: {
        school: { label: 'Just finished school', description: 'You are looking for your first apprenticeship or job.' },
        training_or_studies: { label: 'Just finished training or studies', description: 'You have a qualification and are looking for your first job.' },
        working: { label: 'In working life', description: 'You are working or have worked before.' },
        returning: { label: 'Returning after a break', description: 'You are coming back after a longer time, for example after a family phase.' },
      },
    },
    years: {
      title: { working: 'How long have you been in working life?', returning: 'How long were you in working life before the break?' },
      hint: { working: 'Pick a quick choice or type the years yourself. Roughly is fine.', returning: 'Pick a quick choice or type the years yourself. Roughly is fine.' },
      choices: { none: 'None', under2: 'Under 2 years', from2: '2 to 5 years', from5: '5 to 10 years', from10: '10 to 15 years', over15: 'Over 15 years' },
      choicesLabel: 'Quick choice',
      fieldLabel: 'Or an exact number',
      fieldHint: 'Whole years, from 0 to 60.',
      unit: 'years',
      invalid: 'Please enter a whole number only, for example 7.',
      range: (max) => `Too large: at most ${max} years.`,
      required: 'Please pick a quick choice or enter a number.',
    },
    plan: {
      title: 'What do you have in mind?',
      hint: 'Choose what fits your next application.',
      options: {
        same_field: { label: 'Stay in the same line of work', description: 'You are applying for a job similar to your last ones.' },
        new_field: { label: 'Change to a different line of work', description: 'You want to do something different from now on.' },
      },
    },
    explain: {
      title: 'Is there anything to explain?',
      hint: 'Choose everything that applies. For each point you get a short note.',
      options: {
        none: { label: 'Nothing special', description: 'My CV has nothing unusual.' },
        gap: { label: 'Gap in the CV', description: 'Time without an entry.' },
        parental_leave: { label: 'Parental leave', description: 'A family phase.' },
        illness: { label: 'Longer illness', description: 'A break for health reasons.' },
        unemployment: { label: 'Unemployment', description: 'A time of job-seeking.' },
        dropped_out: { label: 'Dropped-out training or studies', description: 'Something was not completed.' },
        frequent_changes: { label: 'Frequent changes', description: 'Several short stations.' },
      },
    },
    region: {
      title: 'Where are you applying?',
      hint: 'CV and cover letter differ from country to country.',
      options: {
        de: { label: 'Germany', description: 'An application in the German way.' },
        uk: { label: 'United Kingdom', description: 'A "CV" in English.' },
        us: { label: 'USA', description: 'A "resume" in English.' },
      },
    },
  },

  plan: {
    heading: 'Your application plan',
    changeAnswers: 'Change answers',
    overview: 'All situations',
    answersLabel: 'Your answers',
    legendTitle: 'How to read the markers',
    disclaimerTitle: 'Orientation, not legal advice',
    disclaimer:
      'There is no rule for what an application must look like. Guides, for example from the German Federal Employment Agency (BA), do not always agree; where they contradict each other, this is said here. Time spans such as "after ten years" are rules of thumb. The job posting and the employer\'s wishes are what counts.',
    sourcesTitle: 'Where the advice comes from',
    sources:
      'The basis is chapter 22 of the manual, which lists the sources: Bundesagentur für Arbeit (BA), Bitkom, StepStone, Karrierebibel, Hays, get-in-it, Randstad, ingenieur.de, National Careers Service, Prospects and UC Berkeley. Most of them are German, so the advice fits applications in Germany best. Many guides have interests of their own, for example advertising application tools.',
    goTo: 'Put it into practice',
    externalHint: 'Opens in the browser',
  },

  overview: {
    heading: 'All situations at a glance',
    intro: 'To read up on: for each situation, the plan as it looks for typical answers. You get your own plan with the assistant.',
    back: 'Back',
    tabsLabel: 'Situation',
    tabs: {
      school: 'Finished school',
      training: 'Finished training / studies',
      some: 'A few years of experience',
      long: 'Long experience',
      switch: 'Changing careers',
      returning: 'Returning to work',
      sensitive: 'Delicate points',
      uk: 'United Kingdom',
      us: 'USA',
    },
    note: 'These answers are only an example and not yours.',
    exampleLabel: 'Assumed answers',
    examples: {
      school: 'Finished school, first job, Germany',
      training: 'Finished training or studies, first job, Germany',
      some: '3 years of experience, same line of work, Germany',
      long: '12 years of experience, same line of work, Germany',
      switch: '3 years of experience, changing to a different line of work, Germany',
      returning: 'Returning after 7 years in work, same line of work, Germany',
      sensitive: 'All six delicate points at once; only this block is shown',
      uk: '3 years of experience, same line of work, United Kingdom; only the block for abroad is shown',
      us: '3 years of experience, same line of work, USA; only the block for abroad is shown',
    },
  },

  summary: {
    situation: {
      school: 'Finished school',
      training_or_studies: 'Finished training or studies',
      working: 'In working life',
      returning: 'Returning after a break',
    },
    plan: { same_field: 'Same line of work', new_field: 'Changing careers', first_job: 'First job' },
    region: { de: 'Germany', uk: 'United Kingdom', us: 'USA' },
    years: (years) => (years === 1 ? '1 year of experience' : `${years} years of experience`),
    explainNone: 'Nothing to explain',
    explain: {
      gap: 'Gap',
      parental_leave: 'Parental leave',
      illness: 'Illness',
      unemployment: 'Unemployment',
      dropped_out: 'Dropped out',
      frequent_changes: 'Frequent changes',
    },
  },

  kinds: {
    rule: 'Sources agree',
    ruleOfThumb: 'Rule of thumb',
    recommendation: 'Recommendation',
    disputed: 'Sources disagree',
    thin: 'Thin sources',
    unproven: 'Not proven',
    app: 'In the app',
    example: 'Example',
  },
  kindHelp: {
    rule: 'The sources say the same. Even so, it is orientation and not a rule.',
    ruleOfThumb: 'A number or limit that guides name. It does not hold for every case.',
    recommendation: 'A recommendation from the manual, drawn from the sources. It is a suggestion, not a must.',
    disputed: 'The sources contradict each other. Both sides are in the text.',
    thin: 'There is only one source or a few. Take the note as one opinion.',
    unproven: 'No source was found for this. The text says so openly.',
    app: 'What the app does for you at this point.',
    example: 'An invented example, not a requirement.',
  },

  blocks: {
    contents: { title: 'What belongs in the application', intro: 'The parts and their order.' },
    region: { title: 'Special points abroad', intro: 'What differs from Germany.' },
    cvStructure: { title: 'How the CV is built', intro: 'Form, sections and length.' },
    trim: { title: 'What you can shorten or leave out', intro: 'It is not your age that decides but relevance.' },
    attachments: { title: 'Attachments: which and how many', intro: 'More experience, fewer certificates.' },
    coverLetter: { title: 'What matters in the cover letter', intro: 'It does not retell the CV but makes a proposal.' },
    sensitive: { title: 'Delicate points', intro: 'On the points you ticked.' },
    findData: { title: 'Where do I find my dates?', intro: 'If you no longer know the time spans exactly.' },
  },

  items: {
    'contents.order': {
      text: 'Cover letter, CV, certificates: this is the order in which you ideally put the documents together (German Federal Employment Agency, BA). The cover letter comes first, then the CV, then the certificates.',
    },
    'contents.coverLetter': {
      text: 'Not every employer wants a cover letter. Read the job posting: if it asks for one or offers a text field, it is worth it. For online applications some companies no longer want one, so check first (BA).',
    },
    'contents.coverSheet': {
      text: 'A cover sheet is optional. The BA calls it "not a mandatory part", but "it can make sense"; another source considers it "no longer relevant". If there is a cover sheet, the photo belongs there.',
    },
    'contents.thirdPageEntry': {
      text: 'A third page with extra information (for example a project or a blog) is, according to the BA, rather not needed for people starting out.',
    },
    'contents.thirdPage': {
      text: 'A third page with extra information (for example a project or a blog) is optional and disputed among experts.',
    },
    'contents.samples': { text: 'Work samples and a motivation letter only go in if the employer asks for them.' },
    'contents.digital': {
      text: 'In Germany almost all employers accept applications digitally, by e-mail or through an online portal (a 2025 survey of 852 companies: all of them). Every document should be a PDF.',
    },
    'contents.files': {
      text: 'One combined PDF or several files? By e-mail you usually send one single PDF, in portals you often upload the documents one by one. A BA leaflet also mentions splitting it into up to three files (CV, all certificates, cover letter). The guides do not agree. Recommendation: follow the job posting. If it says nothing, one combined PDF is the usual way.',
    },
    'contents.abroad': {
      text: 'This advice comes mostly from German sources. For the United Kingdom and the USA the sources only name the special points in the next block. The job posting always counts.',
    },

    'region.language': {
      text: 'Set the document language to English: headings and fixed words are then English, and dates appear for example as "23 Apr 1990". The app does not translate your own texts; the AI translation does that. Create the cover letter with the language English too.',
    },
    'region.ukTerm': { text: 'In the United Kingdom the CV is called "CV", in the USA and Canada "resume".' },
    'region.ukPrivate': {
      text: 'According to the National Careers Service, age, date of birth, marital status and nationality should not be included. A photo is not needed, except for acting and modelling (Prospects).',
    },
    'region.ukSections': {
      text: 'Usual sections: contact details, an introduction (personal profile) at the top, education, career history and references ("available on request"). If you have a lot of experience, put the career history before education.',
    },
    'region.ukApp': {
      text: 'In the app, switch the photo off and leave date of birth, marital status and nationality empty. According to one guide page, certificates are not enclosed: then choose no attachments for the application.',
    },
    'region.ukUnknown': { text: 'The sources say nothing about a signature.' },
    'region.usTerm': {
      text: 'In the USA and Canada the CV is called "resume". A "CV" there is a long, academic document. If an employer asks for a "CV", they often mean a resume. Ask.',
    },
    'region.usUnknown': {
      text: 'For the USA no source was found on photo, date of birth, marital status, signature, certificates and short profile. Follow the job posting.',
    },

    'cv.form': {
      text: 'The CV is in table form (time spans on the left, description on the right) and reverse-chronological: the newest station comes first. Time spans are given with month and year, for example 03/2021 to 08/2024. The more recent and important a phase of life, the higher up it stands.',
    },
    'cv.sections': {
      text: 'The usual sections:',
      points: [
        'Personal details: name, address, phone, e-mail',
        'Short profile (optional): a few sentences about your focus',
        'Work experience: job title, employer, period and the most important things you did and achieved',
        'Education: degree, institution, period',
        'Further education and certificates: only what fits the job',
        'Skills and languages',
        'Volunteering and interests: only if it fits the job or says something about you',
      ],
    },
    'cv.profileEntry': {
      text: 'A short profile (a few sentences about your focus) is optional. According to Karrierebibel it is most useful for people starting out, career changers and managers.',
    },
    'cv.profileSwitch': {
      text: 'A short profile that explains the change in one sentence helps. It is optional, but according to Karrierebibel most useful for career changers.',
    },
    'cv.profileOptional': {
      text: 'A short profile (a few sentences about your focus) is optional. According to Karrierebibel it is most useful for people starting out, career changers and managers.',
    },
    'cv.lengthEntry': { text: 'Length: one to two A4 pages (BA). People starting out usually manage with one page.' },
    'cv.lengthSome': {
      text: 'Length: the BA names one to two A4 pages. Recommendation: two pages are a good frame. If it gets longer, shorten it using the notes further down.',
    },
    'cv.lengthLong': {
      text: 'Length: the BA names one to two A4 pages, other guides allow up to three for long careers (Hays: two to at most three). Recommendation: two pages are a good frame. If it gets longer, shorten it using the notes further down.',
    },
    'cv.lengthUk': { text: 'Length: up to two A4 pages, three are possible for a long career (Prospects).' },
    'cv.lengthUsEntry': { text: 'Length: a resume for students and people starting out usually fits on one page (UC Berkeley).' },
    'cv.lengthUsMore': { text: 'Length: for longer careers in the USA no checked source was found.' },
    'cv.template': {
      text: 'Template: for most applications a calm template is the safe choice, especially in traditional industries. Expressive templates suit creative or less formal jobs better. This is a recommendation, not a rule.',
    },
    'cv.ats': {
      text: 'Applicant tracking systems (programs that collect applications and make them sortable): there is no reason to panic. Recommendation: a clear, simple layout, normal headings, words from the job posting only where they really fit you, and a PDF that is readable as a file.',
    },
    'cv.personalCore': { text: 'Personal details: name, address, phone and a serious e-mail address with your name belong in.' },
    'cv.personalOptional': {
      text: 'Everything else is usual or optional, but not a must. The sources disagree in details. An explicit statement that photo, date of birth or marital status must be left out does not exist; whether leaving them out improves or lowers your chances is not proven. Recommendation: include only what serves the job and what you are comfortable with. If an employer explicitly asks for an item, enter it.',
      points: [
        'Photo: optional ("no longer a must", BA). In Germany it is still widespread. If you use one, make it recent (at most a year old).',
        'Date and place of birth: the BA counts both among the personal details, other guides call it optional.',
        'Marital status, children, nationality: optional.',
        'Signature, place and date at the end: optional. One website calls the signature mandatory without naming a law; no law for it was found.',
      ],
    },

    'trim.relevance': {
      text: 'It is not your age that decides but relevance: what matters for the job stands in detail. What lies far back or has nothing to do with the job becomes shorter or drops out. "Shortening does not mean hiding experience" (Hays). All time spans here are rules of thumb from guides, not a rule. Breaks of more than two months should be named.',
    },
    'trim.entrySchool': {
      text: 'Rules of thumb for starting out:',
      points: [
        'In detail: internships, projects, volunteering',
        'Combine: bundle several side jobs',
        'Usually left out: internships under six weeks if they do not fit the job',
      ],
    },
    'trim.entryTraining': {
      text: 'Rules of thumb for starting out:',
      points: [
        'In detail: training or studies, internships, projects, volunteering',
        'Shorter: school, usually only the degree; bundle several side jobs',
        'Usually left out: internships under six weeks if they do not fit the job',
      ],
    },
    'trim.some': {
      text: 'Rules of thumb for a few years of experience (up to about 10):',
      points: ['In detail: the last three stations', 'Shorter: keep earlier stations short, bundle side jobs'],
    },
    'trim.someDegree': { text: 'After five to ten years of experience, only the highest degree with overall grade counts, according to Karrierebibel.' },
    'trim.someInternships': { text: 'Usually left out: internships that are older than five years and have little relevance (Karrierebibel).' },
    'trim.long': {
      text: 'Rules of thumb for long experience (10 to 20 years and more):',
      points: [
        'In detail: the latest stations with tasks and achievements',
        'Shorter: compress older stations; a collective heading such as "Earlier positions" helps',
        'School: the year of graduation is enough',
      ],
    },
    'trim.long20': { text: 'With over 20 years of experience: limit it to focus areas, achievements and milestones.' },
    'trim.long30': { text: 'With over 30 years of experience: a few key stations.' },
    'trim.longDrop': {
      text: 'Usually left out: school and side jobs, early internships, outdated software and certificates, task lists from entry-level jobs and earlier degrees next to a higher one.',
    },
    'trim.newField': {
      text: 'Changing careers (a recommendation derived from the principle of relevance; there is no source of its own for this): stations and further education that fit the new goal stand in detail. Everything unrelated to the goal is shorter.',
    },
    'trim.returning': {
      text: 'Returning to work (the sources are thin, the notes rely on a single guide): name the time of the break, for a family phase for example as "family phase", and name further education or volunteering in that time. Shorten older stations as in the rules above.',
    },
    'trim.personalNever': {
      text: 'Does not belong in the CV: parents\' occupation and siblings (BA). Name your religion only if the employer asks.',
    },
    'trim.interests': {
      text: 'Hobbies and interests only if they fit the job: two to four, related to the job or your person. "Hobbies prove nothing" (BA). Do list volunteering.',
    },
    'trim.interestsUs': {
      text: 'In the USA interests and hobbies are optional on a resume and, according to UC Berkeley, among the first sections to cut (the view of a single university).',
    },
    'trim.app': {
      text: 'In the app, when you create an application you decide under "CV content" what goes into this application: entries in full, short or left out. The app makes a suggestion and gives the reason, you decide. Your master profile stays unchanged.',
    },

    'att.school': {
      text: 'The last two school reports (BA) and relevant certificates are usual. If you did internships and lack work experience, one or two internship references are added.',
    },
    'att.training': {
      text: 'Usual are:',
      points: [
        'the final certificate; for an apprenticeship also the certificates of the company, the chamber and the vocational school, for studies the document of the highest degree',
        'one or two internship references if you lack experience',
        'relevant certificates',
      ],
    },
    'att.schoolReports': {
      text: 'School reports are disputed: the BA names the last two as usual (it addresses pupils and people starting out). Other guides say: only for school leavers without work experience, leave them out with a university degree or long experience. Recommendation: with work experience, leave them out.',
    },
    'att.some': {
      text: 'Usual are:',
      points: [
        'the highest degree',
        'reference letters of the latest jobs; StepStone names at most three recent ones',
        'relevant certificates',
      ],
    },
    'att.long': {
      text: 'Usual are the highest degree plus one or two recent reference letters and recent, relevant training. Leave out older certificates unrelated to the job (Hays). Rule of thumb: more experience, fewer certificates.',
    },
    'att.noSchool': {
      text: 'Leave out school reports when you have work experience (recommendation; StepStone: leave them out with a university degree or long experience).',
    },
    'att.never': {
      text: 'Never: primary school reports. Police clearance certificate, health certificate and driving licence only if the employer asks for them.',
    },
    'att.count': { text: 'In total, one guide names about five to seven documents and six to seven pages.' },
    'att.order': {
      text: 'Order: most sources (the BA and others) say: the most recent first. One guide advises the reverse order. Recommendation: the most recent first.',
    },
    'att.list': {
      text: 'A list of attachments is seen differently: a BA page considers it useful with many documents, a BA leaflet says attachments are no longer listed one by one today. In the cover letter the word "Attachments" is enough.',
    },
    'att.file': {
      text: 'File size: the employer sets the frame here. Without a requirement the sources name two to five megabytes (MB) in total, the BA leaflet at most 2 MB; 2 MB is the safest value. Scans in black and white at 200 dots per inch are enough. File name: descriptive, with your name, for example FirstName_LastName_CV.pdf.',
    },
    'att.email': {
      text: 'E-mail: a serious address with your name, the job (and the reference number, if there is one) in the subject. Send the mail to yourself first. Check how the documents look in black and white, because often nothing is printed in colour in the HR department (BA).',
    },
    'att.uk': {
      text: 'In the United Kingdom the sources name references "available on request". According to one guide page, certificates are not enclosed: then choose no attachments for the application.',
    },
    'att.us': { text: 'For attachments in the USA no source was found. Follow the job posting.' },

    'cl.purpose': {
      text: 'The cover letter is not a description of your career but a proposal to the employer: what do you bring that the job needs? The CV shows the stations, the cover letter the "why".',
    },
    'cl.length': {
      text: 'Length: one page at most. The BA names 1,600 to 2,000 characters (about 250 to 300 words), guides name 250 to 350 words. Recommendation: around 250 to 330 words in at most five paragraphs.',
    },
    'cl.paragraphs': {
      text: 'A possible structure (recommendation):',
      points: [
        'Opening, 2 to 3 sentences: a concrete reference to the posting and one sentence on what you do today',
        'Motives, 3 to 4 sentences: why you chose this job, and proof that you have already started (course, certificate, project)',
        'Strengths with proof, 4 to 5 sentences: two to three strengths, each with an example, ideally with a number or result',
        'Fit with the company, 2 to 3 sentences: why this company in particular, and what you contribute',
        'Closing, 2 sentences: earliest start date (if you have a job: after the notice period) and the request for an interview',
      ],
    },
    'cl.musts': {
      text: 'What belongs in:',
      points: [
        'A contact person with a name in the salutation; "Dear Sir or Madam" is only the emergency option',
        'An opening without "I hereby apply" (the BA calls it boring)',
        'Proven strengths: "resilient, flexible, a team player" cannot be proven, says the BA',
        'A factual, confident tone in the formal form of address, with short sentences',
        'At the end the word "Attachments" is enough, a list is superfluous (BA)',
      ],
    },
    'cl.never': {
      text: 'What does not belong in:',
      points: [
        'the retold CV',
        'apologies, for example "although my path is not classic"',
        'a list of what you still lack',
        'a project in every detail (one sentence and a link are enough)',
        'private and health matters',
        'a salary wish, unless the posting asks for it',
      ],
    },
    'cl.switchReason': {
      text: 'When you change careers, the motive is your goal. Name the reason briefly, otherwise the question everybody asks stays open. The guides agree on the direction: toward, not away.',
      points: [
        'Say where you want to go, why, and what you already prove it with (course, certificate, project).',
        'Not: what bothers you about the old job. Cross out reasons such as "more money", "more free time" or "boredom".',
        'Never speak badly of former employers.',
        'Write only what is true. In the interview you will be asked about it.',
      ],
    },
    'cl.switchExample': {
      text: 'Example of a "toward" (invented): "In future I want to advise customers more. For this I took a course last year and have since been joining customer conversations in my department."',
    },
    'cl.entry': { text: 'The sources name no rule of their own for the cover letter when starting out. The notes above apply to everybody.' },
    'cl.sensitive': {
      text: 'The delicate points you ticked belong briefly in the CV (see below). In the cover letter do not apologise for your path, and private and health matters do not belong in it. A dropped-out course of studies is only named there if it explains your path.',
    },
    'cl.language': { text: 'Set the language of the cover letter to English too.' },
    'cl.abroadNote': { text: 'The notes on the cover letter come from German sources. For the United Kingdom and the USA no source of its own was found.' },

    'sens.honest': {
      text: 'Principle: stay honest and name things briefly. Hiding gaps is risky: according to guides, false statements can later lead to dismissal. (The legal consequences were not checked.)',
    },
    'sens.gap': {
      text: 'Gap in the CV: say what you did in that time. From which length is not uniform: the BA and StepStone give about two months as a guideline and see it as critical from about three months, other guides only from three to four months. Recommendation: explain gaps from about two to three months with a keyword. The gap analysis in the master profile reports every gap of one full calendar month or more. It only points and does not judge.',
    },
    'sens.unemployment': {
      text: 'Unemployment: do not hide it. Write "job-seeking" instead of "unemployed" and name further education or projects. Three guides agree here.',
    },
    'sens.parental_leave': {
      text: 'Parental leave: simply write "parental leave" or "family phase". You need no details. The guides agree.',
    },
    'sens.illness': {
      text: 'Longer illness: no diagnosis. The period is enough, for example "break for health reasons". Whether to write "private reasons" or to mention full recovery, the guides see differently.',
    },
    'sens.dropped_out': {
      text: 'Dropped-out apprenticeship or studies: you do not have to state studies. It is worth it if it explains a gap or gave you skills, for example: "10/2020 – 03/2022, Bachelor\'s degree in biology (not completed)". No emotional explanations. This is the view of a single provider. For a dropped-out apprenticeship no source was found.',
    },
    'sens.frequent_changes': {
      text: 'Frequent changes: give month and year, never years only. The guides disagree: one allows combining very short stations under "orientation phase" if at least two years follow. Another advises explaining openly. Both are single opinions.',
    },
    'sens.abroadNote': { text: 'This advice comes from German sources. For the United Kingdom and the USA no source of its own was found.' },

    'find.dates': {
      text: 'For school, the year of graduation is usually enough. The app also accepts just a year, and for training the start or the end will be enough in future. For the other stations, write month and year.',
    },
    'find.documents': { text: 'The dates are in your certificates and employment contracts.' },
    'find.drv': {
      text: 'Germany only: the German pension insurance (Deutsche Rentenversicherung) sends you your insurance history free of charge, a chronological overview of all periods that count towards your pension. It can help if you no longer know time spans exactly. You request it without registering, by post (with your insurance number), or register in the customer portal. Whether and which school periods it contains is not proven here. The pages are in German.',
    },
  },

  links: {
    profilePersonal: 'Master profile: Personal',
    profileExperiences: 'Master profile: Work experience',
    profileEducations: 'Master profile: Education',
    profilePreview: 'Master profile: Preview & Export',
    coverLetters: 'Go to the cover letters',
    applications: 'Go to the applications',
  },
  externalLinks: {
    drvRequest: 'Request your insurance history (Deutsche Rentenversicherung, German)',
    drvGlossary: 'What is an insurance history? (Deutsche Rentenversicherung, German)',
  },
}
