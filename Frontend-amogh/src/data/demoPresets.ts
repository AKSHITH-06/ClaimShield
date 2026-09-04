/**
 * Demo presets — INPUT TEXT ONLY.
 *
 * These pre-fill the form so a demo does not depend on live typing. They deliberately do NOT
 * contain pre-baked responses: pressing a preset runs the real pipeline against the real
 * backend, so what a judge sees is the actual system working rather than a canned playback.
 *
 * Source: docs/sample_rejection_letters.md
 */

export interface DemoPreset {
  id: string;
  label: string;
  hint: string;
  policyText: string;
  rejectionText: string;
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "ped",
    label: "PED Denial (diabetes)",
    hint: "Full rejection letter — the main demo path",
    policyText: "HEALTH INSURANCE POLICY\nPolicy Number: HLP/2021/MH/44829\nPolicyholder: Ramesh Kumar\nInsurer: Star Shield Health Insurance Co. Ltd.\nSum Insured: Rs. 5,00,000\nPolicy Period: 15 March 2021 to 14 March 2024\nInsurance Type: Individual Health Plan\n\nCLAUSE 4 \u2014 PRE-EXISTING DISEASES (PED)\nAny disease, ailment or injury or related condition(s) for which the Insured Person had signs or\nsymptoms, and / or was diagnosed, and / or received medical advice / treatment within 48 months\nprior to the first policy with the Company, shall be excluded for a period of 48 months from the\ndate of commencement of the first Policy with the Company.\n\nCLAUSE 7 \u2014 DISCLOSURE OBLIGATION\nThe Policyholder is required to disclose all material facts at the time of proposal, including but\nnot limited to, any pre-existing diseases, ongoing treatments, or prior hospitalizations. Failure\nto disclose a material fact may result in repudiation of the claim and voidance of the policy.",
    rejectionText: "Star Shield Health Insurance Co. Ltd.\nCorporate Office: 12th Floor, Prestige Tower, Mumbai \u2013 400 001\n\nDate: 14 September 2023\n\nMr. Ramesh Kumar\n42, Shivaji Nagar, Pune \u2013 411 005\n\nDear Mr. Kumar,\n\nRe: Repudiation of Claim \u2014 Policy No. HLP/2021/MH/44829\n     Claim Reference: CLM/2023/09/8847\n     Hospital: Sahyadri Speciality Hospital, Pune\n     Date of Hospitalization: 22 August 2023\n     Claimed Amount: Rs. 3,85,000\n\nWe refer to the above claim submitted by you in connection with your hospitalization for\nmanagement of Diabetic Ketoacidosis (DKA).\n\nUpon review of your claim documents, including the discharge summary and pathology reports, our\nMedical Advisory Board has determined that your claim is liable to be repudiated on the following\ngrounds:\n\nREASON FOR REPUDIATION: PRE-EXISTING DISEASE \u2014 NON-DISCLOSURE\n\nThe discharge summary from Sahyadri Speciality Hospital confirms a diagnosis of Type 2 Diabetes\nMellitus with Diabetic Ketoacidosis. A review of your medical records, including a blood glucose\nreport dated 12 July 2020 (approximately 8 months prior to the inception of your policy on\n15 March 2021), shows a fasting blood glucose level of 215 mg/dL, which is indicative of\na pre-existing diabetic condition.\n\nUnder Clause 4 of your policy, pre-existing diseases are excluded for 48 months from policy\ncommencement. As diabetes is established to have existed prior to policy commencement, and the\n48-month waiting period has not elapsed, your claim does not qualify for coverage at this time.\n\nWe regret that we are unable to process your claim.\n\nYours sincerely,\nClaims Department\nStar Shield Health Insurance Co. Ltd.",
  },
  {
    id: "waiting",
    label: "Waiting Period (hernia)",
    hint: "Second denial category, emergency admission",
    policyText: "HEALTH INSURANCE POLICY\nPolicy Number: FHP/2022/DL/77341\nPolicyholder: Sunita Verma\nInsurer: National Guard Health Insurance\nSum Insured: Rs. 3,00,000\nPolicy Period: 1 July 2022 to 30 June 2025\n\nSCHEDULE OF BENEFITS \u2014 WAITING PERIODS\nThe following conditions/procedures are subject to a 2-year waiting period from the date of\ncommencement of the first Policy:\n  - Hernia (all types) and surgical repair thereof\n  - Cataract and lens replacement\n  - Joint replacement surgeries (knee, hip)\n  - Varicose veins treatment\n  - Gallbladder stones and cholecystectomy\n\nThe above waiting period shall not apply in cases of accidental injury or genuine life-threatening\nmedical emergency as certified by the treating physician.\n\nCLAUSE 5 \u2014 EMERGENCY TREATMENT\nIn the event of a medical emergency, the Company shall cover treatment costs subject to submission\nof emergency declaration by the treating physician within 24 hours of admission.",
    rejectionText: "National Guard Health Insurance\nRegistered Office: Connaught Place, New Delhi \u2013 110 001\n\nDate: 28 October 2022\n\nMs. Sunita Verma\nB-47, Lajpat Nagar \u2013 II, New Delhi \u2013 110 024\n\nDear Ms. Verma,\n\nRe: Repudiation of Cashless / Reimbursement Claim\n     Policy No.: FHP/2022/DL/77341\n     Claim No.: NGHPL/CLM/2022/10/2291\n     Hospital: Apollo Hospital, New Delhi\n     Date of Admission: 10 September 2022\n     Treatment: Emergency laparoscopic repair of strangulated inguinal hernia\n     Claimed Amount: Rs. 1,95,000\n\nWe write to inform you that after careful review of your claim, we are unable to approve the\nsame for the following reason:\n\nREASON FOR REPUDIATION: WAITING PERIOD NOT COMPLETED\n\nYour policy commenced on 1 July 2022. The above claim pertains to hernia repair surgery conducted\non 10 September 2022, which is approximately 71 days from policy commencement. Under the Schedule\nof Benefits of your policy, hernia repair is subject to a 2-year waiting period.\n\nAccordingly, your claim is being repudiated under the waiting period provision.\n\nIf you wish to contest this decision, you may approach our Grievance Redressal Officer within\n30 days of receipt of this letter.\n\nYours faithfully,\nClaims Processing Team\nNational Guard Health Insurance",
  },
  {
    id: "sparse",
    label: "Sparse Letter (thin record)",
    hint: "Minimal documentation — shows how the system handles weak input",
    policyText: "",
    rejectionText: "Ref: Claim No. CLM-44172\nPolicy No. ABC-778120\n\nDear Policyholder,\n\nWe regret to inform you that the above claim has been repudiated.\n\nReason: Non-disclosure of pre-existing condition at the time of proposal.\n\nThis decision is final as per the terms and conditions of the policy.\n\nFor any queries, contact the Grievance Redressal Officer.\n\nABC Insurance",
  },
];
