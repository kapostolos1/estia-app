export default {
  
  calendar: {
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ],
    weekdays: ["M","T","W","T","F","S","S"],
  },

  oauthInvite: {
    title: "Invite code (optional)",
    text: "If you are a staff member and have an invite code, enter it here. Otherwise continue as an owner.",
    placeholder: "Enter invite code",
    hint: "If the code is invalid, you will be notified and sign-in will not continue."
  },
  trialIntro: {
    title: "🎉 Welcome to Estia!",
    body: "You have a 30-day free trial.\nAfter the trial, the subscription is €8.99 / month.\n\nYou can cancel anytime.",
    continue: "Continue",
  },

  subscription: { 
    expiredTitleGrace: "Subscription expired",
    expiredTitleLocked: "Subscription expired",
    expiredBannerGrace:
      "Your subscription has expired. For a few hours you can still add new appointments, but renewal is required.",
    expiredBannerLocked:
      "Your subscription has expired. Renew to unlock creating new appointments.",
    expiredBanner: "Your subscription has expired. Renew to continue creating new appointments.",
    expiredInline: "Upgrade to continue creating new appointments.",
    expiredDialogText:
      "You can view your appointments, but you cannot create new ones.",
    expiredTitle: "Subscription expired",
    expiringIn: "Subscription expires in {{hh}}h {{mm}}m",
  },
  sub: {
  warningTitle: "Subscription notice",
  expiredTitle: "Subscription expired",
  renew: "Renew",
  expiringIn: "Your subscription expires in {{hh}}h {{mm}}m",
  expiredInline: "Your subscription has expired — you can view appointments but you can’t create new ones.",
  expiredTitle: "Subscription expired",
  expiredDialogText: "You can view your appointments, but you can’t create new ones."
},

   paywall: {
  titleGrace: "Subscription expired",
  titleExpired: "Subscription required",
  titleDefault: "Subscription",

  subtitleGrace:
    "You have time until: {{ends}}\nTap “Activate” to continue without interruption.",
  subtitleExpired:
    "Access is locked.\nTap “Renew” to reactivate.\nYour data is not lost.",
  subtitleDefault: "Tap “Renew” to activate your subscription.",
  subscribeBtn: "Activate subscription",
  renewBtn: "subscription management",
  checkAgainBtn: "Check again",
  logoutBtn: "Logout",

  errCannotOpenSubscriptions: "I can’t open Play Store subscriptions.",
  errCannotOpenStore: "I couldn’t open the Play Store.",
  errLogout: "Logout failed.",

  debugLine: "Role: {{role}} • Status: {{status}} • Allowed: {{allowed}}",
},
 
   resetPass: {
  title: "New password",
  newPassLabel: "New password",
  confirmLabel: "Confirm",
  save: "Save",

  missingLink: "The reset link is missing.",
  passLen: "Password must be at least 6 characters.",
  noMatch: "Passwords do not match.",

  timeoutRest: "Timeout during update (REST)",
  timeoutSignOut: "Timeout during sign out",

  failGeneric: "Failed to change password.",
  linkExpired: "The reset link expired. Request a new email.",
  failUnknown: "Something went wrong.",

  readyTitle: "Done",
  readyText: "Password changed successfully. Please log in with your new password.",
},
 
   support: {
     contactText: "Email: kapostolos1976@gmail.com\nTel: 6946690119",
   }, 
   invite: {
     activateFail: "Could not activate. Try a new code.",
     enter: "Enter the invite code.",
     title: "Invite code",
     invalidOrUsed: "The code is invalid or has already been used. Ask the owner for a new one.",
   },
 
   details: {
    weekdays: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
    notFound: "Appointment not found.",

    phoneLabel: "Phone",
    datetimeLabel: "Date / Time",

    sendSms: "Send SMS",
    changeDatetime: "Change date / time",
    cancelAppointment: "Cancel appointment",

    smsTitle: "SMS",
    smsNotSupported: "This device does not support SMS.",

    errTitle: "Error",
    errGeneric: "Something went wrong.",

    errDateFull: "Date must be complete (DD-MM-YYYY).",
    errTimeFull: "Time must be complete (HH:MM).",
    errUnknownDT: "Cannot recognize date/time: {{dt}}",

    errPastTitle: "Invalid date",
    errPastText: "You cannot set a past date/time.",

    conflictTitle: "Time unavailable",
    conflictText: "There is already an appointment at this time.",

    updatedOk: "Appointment updated.",

    cancelTitle: "Cancel",
    cancelConfirm: "Are you sure you want to cancel this appointment?",
    yes: "Yes",
    no: "No",

    newDateLabel: "New date (17012026 → 17-01-2026)",
    newTimeLabel: "New time (1030 → 10:30)",

    bookedTitle: "Booked times ({{count}})",
    bookedEmpty: "No appointments on this day.",

    save: "Save",
    cancel: "Cancel",
  }, 
  newAppointment: {
  title: "New Appointment",
  waitTitle: "Please wait",
  waitText: "Business is not loaded yet. Try again in 1–2 seconds.",

  errTitle: "Error",
  errName: "Enter customer name.",
  errPhone: "Enter phone number.",
  errDateFull: "Date must be complete (DD-MM-YYYY).",
  errTimeFull: "Time must be complete (HH:MM).",
  errUnknownDT: "Invalid date/time: {{dt}}",
  errPastTitle: "Invalid",
  errPastText: "You can’t set an appointment in the past.",
  conflictTitle: "Time taken",
  conflictText: "There is already an appointment at the same date and time.",

  nameLabel: "Name",
  namePh: "e.g. Maria",
  phoneLabel: "Phone",
  phonePh: "e.g. 69xxxxxxxx",
  noteLabel: "Notes (optional)",
  notePh: "e.g. appointment details",

  dateLabel: "Date",
  timeLabel: "Time",

  bookedTitle: "Booked times ({{count}})",
  bookedEmpty: "No bookings for this day.",

  save: "Save",
  saving: "Saving...",

  tip: "Tip: type date like 17012026 and time like 1030 → they become 17-01-2026 and 10:30 automatically.",
},
  
  nav: {
  resetPassword: "New password",
  paywall: "Subscription",
  home: "Appointments",
  newAppointment: "New Appointment",
  appointmentDetails: "Details",
  smsTemplate: "SMS Template",
  users: "Users",
},  
  login: {
    resetTitle: "Reset password",
    resetText: "Enter your email and we’ll send you a reset link.",
    send: "Send",
    tagline: "No more missed appointments.",
    login: "Login",
    signup: "Sign up",
    pleaseWait: "Please wait...",
    createAccount: "Create account",
    fullName: "Full name",
    workPhone: "Work phone",
    inviteCode: "Invite code (staff only)",
    email: "Email",
    password: "Password",
    forgot: "Forgot my password",
    noteLogin: "If you don’t have an account, tap “Sign up”.",
    noteSignup: "If you are staff, enter the invite code. Otherwise leave it empty (owner).",
    inviteTitle: "Invitation code",
    inviteActivateFail:
      "The code could not be activated. Please request a new one and try again.",

    tempProblemTitle: "Temporary issue",
    tempProblemText:
      "The connection with the business was not completed in time. Please sign in again.",

    readyTitle: "Ready!",
    staffReadyText: "You are now a member of the business. You may continue.",
    ownerReadyText: "Owner account has been created.",

    invalidEmail: "Please enter a valid email address",

    resetSentTitle: "Email sent",
    resetSentText:
      "I’ve sent you a reset email.\nTap the link to open the app.",
  },

  reset: {
    title: "Reset password",
    text: "Enter your email and we’ll send you a link.",
    send: "Send",
    cancel: "Cancel",
    sentTitle: "Email sent",
    sentText: "We sent you a reset email. Tap the link to open the app.",
  },

  errors: {
    errorTitle: "Error",
    fillEmailPass: "Enter email and password",
    validEmail: "Enter a valid email",
    passLen: "Password must be at least 6 characters",
    fillName: "Enter full name",
    fillPhone: "Enter work phone",
    waitTitle: "Please wait",
    waitText: "Security check in progress. Try again in 1–2 seconds.",
  },

  common: {
    close: "Close",
    loading: "Loading...",
    new: "New",
    cancel: "Cancel",
    ok: "OK",
    yes: "Yes",
    errorTitle: "Error",
    genericError: "Something went wrong.",
    close: "Close",
    continue: "Continue",
    logout: "Logout",
    logoutTitle: "Logout",
    logoutConfirm: "Are you sure you want to log out?",
  },

  home: {
    dayCount: "Appointments",
    noAppointmentsDay: "No appointments for this day.",
    subscriptionExpiredTitle: "Subscription expired",
    connectBusiness: "Connect to business",
    checkingConnection: "Please wait — checking connection...",
    enterInvite: "Enter invite code.",
    inviteTitle: "Invite code",
    inviteText: "Enter the invite code provided by the owner to connect to a business.",
    invitePlaceholder: "Invite code",
    logout: "Logout",
    logoutTitle: "Logout",
    logoutConfirm: "Are you sure you want to log out?",
    logoutFail: "Could not log out.",
    addNew: "+ New",
    menu: {
      title: "Options",
      smsTemplate: "SMS Template",
      users: "Users/Staff",
      support: "Support",
      back: "Back",
      cancel: "Cancel",
    },
    tabs: {
      today: "Today",
      upcoming: "Upcoming",
      history: "History",
      search: "Search",
    },

    sms: {
      title: "📩 You need to send SMS",
      in2h: "In ~2 hours",
      in24h: "In ~24 hours",
      send: "Send",
      hint: 'Tap "Send" to open the SMS with a ready message.',
      alertTitle: "SMS",
      notSupported: "This device does not support sending SMS.",
      missingPhone: "This appointment is missing a phone number.",
      updateFail: "Could not mark SMS as sent.",
    },

    search: {
      placeholder: "Type name/phone/notes",
    },

    empty: {
      searchNoResult: "No results found.",
      searchTypeSomething: "Type something to search.",
      noPast: "No past appointments.",
      noAppointments: "No appointments.",
    },
  },

  menu: {
    title: "Options",
    smsTemplate: "SMS Template",
    users: "Users/Staff",
    support: "Support",
    back: "Back",
  },
  smsTemplate: {
  title: "SMS Template",
  tagsLabel: "Use these tags:",
  textLabel: "Text:",
  previewLabel: "Preview:",
  placeholder: "Write your template here...",
  resetBtn: "Reset",
  saveBtn: "Save",
  saving: "Saving...",
  hint: "Note: The SMS will open in your phone’s messaging app with prefilled text.",

  resetTitle: "Reset",
  resetText: "Do you want to reset the template to default?",
  resetYes: "Yes",

  saved: "SMS template saved.",

  errors: {
    emptyTemplate: "Template cannot be empty.",
    saveFailed: "Could not save the template.",
  },

},
users: {
  title: "Users",
  menuTitle: "Users / Staff",
  noBusinessTitle: "Business not found",
  noBusinessText: "No business_id found in profile.",
  ownerOnlyText: "Only the owner can manage users.",

  inviteTitle: "Invite code",
  inviteText: "Share this code with staff to sign in.",

  addStaffCode: "+ Staff code",

  ownerSection: "Owner",
  teamSection: "Team",
  phone: "Phone",

  emptyUsers: "No users found.",

  removeBtn: "Remove",
  removeTitle: "Remove staff",
  removeText:
    "Do you want to remove this user:\n{NAME}\n\nTheir account won’t be deleted — they will just be disconnected from the business.",

  cantTitle: "Not allowed",
  cantRemoveOwner: "You can't remove the owner.",

  notAllowedTitle: "Not allowed",
  notAllowedText: "Only the owner can create staff codes.",

  errors: {
    loadUsers: "Couldn't load users.",
    createInvite: "Couldn't create code.",
    removeUser: "Couldn't remove user.",
  },
  
},



};

