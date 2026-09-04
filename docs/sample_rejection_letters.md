# Sample Rejection Letters — `/extract` Endpoint Test Cases

These are **synthetic** rejection letters for testing Person B's `/extract` endpoint.
Do NOT use real customer documents. Privacy note: all names, policy numbers, and hospital names are fictional.

---

## Letter 1 — PED Non-Disclosure (diabetes, policyholder-favorable scenario)

**Purpose:** Should extract `rejection_reason = "ped_non_disclosure"`, `condition = "diabetes"`, `disclosure_issue = true`, `documentation_issue = false`.

---

### Policy Text (paste into `policy_text` field)

```
HEALTH INSURANCE POLICY
Policy Number: HLP/2021/MH/44829
Policyholder: Ramesh Kumar
Insurer: Star Shield Health Insurance Co. Ltd.
Sum Insured: Rs. 5,00,000
Policy Period: 15 March 2021 to 14 March 2024
Insurance Type: Individual Health Plan

CLAUSE 4 — PRE-EXISTING DISEASES (PED)
Any disease, ailment or injury or related condition(s) for which the Insured Person had signs or
symptoms, and / or was diagnosed, and / or received medical advice / treatment within 48 months
prior to the first policy with the Company, shall be excluded for a period of 48 months from the
date of commencement of the first Policy with the Company.

CLAUSE 7 — DISCLOSURE OBLIGATION
The Policyholder is required to disclose all material facts at the time of proposal, including but
not limited to, any pre-existing diseases, ongoing treatments, or prior hospitalizations. Failure
to disclose a material fact may result in repudiation of the claim and voidance of the policy.
```

### Rejection Letter (paste into `rejection_text` field)

```
Star Shield Health Insurance Co. Ltd.
Corporate Office: 12th Floor, Prestige Tower, Mumbai – 400 001

Date: 14 September 2023

Mr. Ramesh Kumar
42, Shivaji Nagar, Pune – 411 005

Dear Mr. Kumar,

Re: Repudiation of Claim — Policy No. HLP/2021/MH/44829
     Claim Reference: CLM/2023/09/8847
     Hospital: Sahyadri Speciality Hospital, Pune
     Date of Hospitalization: 22 August 2023
     Claimed Amount: Rs. 3,85,000

We refer to the above claim submitted by you in connection with your hospitalization for
management of Diabetic Ketoacidosis (DKA).

Upon review of your claim documents, including the discharge summary and pathology reports, our
Medical Advisory Board has determined that your claim is liable to be repudiated on the following
grounds:

REASON FOR REPUDIATION: PRE-EXISTING DISEASE — NON-DISCLOSURE

The discharge summary from Sahyadri Speciality Hospital confirms a diagnosis of Type 2 Diabetes
Mellitus with Diabetic Ketoacidosis. A review of your medical records, including a blood glucose
report dated 12 July 2020 (approximately 8 months prior to the inception of your policy on
15 March 2021), shows a fasting blood glucose level of 215 mg/dL, which is indicative of
a pre-existing diabetic condition.

Under Clause 4 of your policy, pre-existing diseases are excluded for 48 months from policy
commencement. As diabetes is established to have existed prior to policy commencement, and the
48-month waiting period has not elapsed, your claim does not qualify for coverage at this time.

We regret that we are unable to process your claim.

Yours sincerely,
Claims Department
Star Shield Health Insurance Co. Ltd.
```

---

## Letter 2 — Waiting Period (hernia surgery, policyholder-favorable emergency scenario)

**Purpose:** Should extract `rejection_reason = "waiting_period"`, `condition = "hernia"`, `disclosure_issue = false`, `documentation_issue = false`.

---

### Policy Text (paste into `policy_text` field)

```
HEALTH INSURANCE POLICY
Policy Number: FHP/2022/DL/77341
Policyholder: Sunita Verma
Insurer: National Guard Health Insurance
Sum Insured: Rs. 3,00,000
Policy Period: 1 July 2022 to 30 June 2025

SCHEDULE OF BENEFITS — WAITING PERIODS
The following conditions/procedures are subject to a 2-year waiting period from the date of
commencement of the first Policy:
  - Hernia (all types) and surgical repair thereof
  - Cataract and lens replacement
  - Joint replacement surgeries (knee, hip)
  - Varicose veins treatment
  - Gallbladder stones and cholecystectomy

The above waiting period shall not apply in cases of accidental injury or genuine life-threatening
medical emergency as certified by the treating physician.

CLAUSE 5 — EMERGENCY TREATMENT
In the event of a medical emergency, the Company shall cover treatment costs subject to submission
of emergency declaration by the treating physician within 24 hours of admission.
```

### Rejection Letter (paste into `rejection_text` field)

```
National Guard Health Insurance
Registered Office: Connaught Place, New Delhi – 110 001

Date: 28 October 2022

Ms. Sunita Verma
B-47, Lajpat Nagar – II, New Delhi – 110 024

Dear Ms. Verma,

Re: Repudiation of Cashless / Reimbursement Claim
     Policy No.: FHP/2022/DL/77341
     Claim No.: NGHPL/CLM/2022/10/2291
     Hospital: Apollo Hospital, New Delhi
     Date of Admission: 10 September 2022
     Treatment: Emergency laparoscopic repair of strangulated inguinal hernia
     Claimed Amount: Rs. 1,95,000

We write to inform you that after careful review of your claim, we are unable to approve the
same for the following reason:

REASON FOR REPUDIATION: WAITING PERIOD NOT COMPLETED

Your policy commenced on 1 July 2022. The above claim pertains to hernia repair surgery conducted
on 10 September 2022, which is approximately 71 days from policy commencement. Under the Schedule
of Benefits of your policy, hernia repair is subject to a 2-year waiting period.

Accordingly, your claim is being repudiated under the waiting period provision.

If you wish to contest this decision, you may approach our Grievance Redressal Officer within
30 days of receipt of this letter.

Yours faithfully,
Claims Processing Team
National Guard Health Insurance
```

---

## Letter 3 — Documentation Deficiency (pre-authorization not obtained)

**Purpose:** Should extract `rejection_reason = "documentation"`, `documentation_issue = true`, `disclosure_issue = false`.

---

### Policy Text (paste into `policy_text` field)

```
HEALTH INSURANCE POLICY
Policy Number: UNI/2020/MH/12056
Policyholder: Ajit Patil
Insurer: United Bharat Health Insurance
Sum Insured: Rs. 4,00,000
Policy Period: 1 August 2020 to 31 July 2023

CLAUSE 9 — PRE-AUTHORIZATION FOR PLANNED SURGERIES
All planned/elective surgical procedures with expected claim value above Rs. 50,000 must be
pre-authorized by the Company's TPA (Third Party Administrator) prior to the date of
hospitalization. Failure to obtain pre-authorization shall result in rejection of the cashless
facility and may result in rejection of reimbursement claim.

CLAUSE 10 — EMERGENCY HOSPITALIZATIONS
In the event of emergency hospitalization, the Insured Person or their representative must
inform the Company's TPA helpline within 24 hours of admission. Failure to notify within this
period may result in partial or full rejection of the claim.
```

### Rejection Letter (paste into `rejection_text` field)

```
United Bharat Health Insurance
Claims Department
Nariman Point, Mumbai – 400 021

Date: 5 January 2023

Mr. Ajit Patil
Plot 14, Sector 7, Kharghar, Navi Mumbai – 410 210

Dear Mr. Patil,

Re: Repudiation of Reimbursement Claim
     Policy No.: UNI/2020/MH/12056
     Claim Ref.: UB/CLM/2022/12/0088
     Hospital: Fortis Hospital, Navi Mumbai
     Date of Admission: 3 December 2022
     Treatment: Open reduction and internal fixation of right tibial fracture
     Claimed Amount: Rs. 2,30,000

We have reviewed your claim submitted for the above treatment. After careful examination of
the claim documents, we regret to inform you that we are unable to process your claim for
the following reason:

REASON FOR REJECTION: DOCUMENTATION DEFICIENCY — PRE-AUTHORIZATION NOT OBTAINED

Our records indicate that no pre-authorization request was made to our TPA (MedAssist TPA Pvt.
Ltd.) prior to the above hospitalization. As per Clause 9 of your policy, all surgical procedures
with a claim value exceeding Rs. 50,000 require prior written authorization from the Company.

Furthermore, our TPA was not notified of the hospitalization within the 24-hour window required
under Clause 10. Notification was received only on 7 December 2022, which is 4 days after
the date of admission.

We are therefore unable to process the claim in its entirety.

Yours sincerely,
Vikram Nair
Senior Claims Manager
United Bharat Health Insurance
```

---

## How to Test Against `/extract`

For each letter above, construct the request body:

```json
{
  "policy_text": "<paste the Policy Text block here>",
  "rejection_text": "<paste the Rejection Letter block here>",
  "additional_text": ""
}
```

**What to verify in the response:**
1. `fingerprint.rejection_reason` must be **exactly** one of: `ped_non_disclosure`, `waiting_period`, `policy_exclusion`, `documentation`, `partial_settlement` — never a paraphrase.
2. `fingerprint.condition` should match the medical condition described.
3. `fingerprint.disclosure_issue` and `fingerprint.documentation_issue` must be boolean, not strings.
4. `fingerprint.insurer` must match the insurer name from the letter.
5. `extraction_confidence` should be `"high"` for all three — these letters are unambiguous.
6. `fields_needing_review` should be empty or minimal — all key fields are present.
7. `source_spans` should contain quoted text from the documents for each filled field.
