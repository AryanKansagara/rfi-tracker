import { Code, Link } from './ui.tsx'

export default function Docs() {
  return (
    <section className="page docs narrow">
      <div className="eyebrow">Docs</div>
      <h1>Getting your logs out, and how the numbers are worked out</h1>
      <p className="lede-sm">Everything runs in your browser. Files are parsed locally; nothing is uploaded unless you sign in to sync. Steps and column names were checked on <b>8 November 2026</b>. Vendors rename columns from time to time, so the importer also lets you map any column by hand.</p>
      <nav className="toc" aria-label="On this page">
        <a href="#acc">Autodesk Build</a><a href="#procore">Procore</a><a href="#history">Status history</a><a href="#schedule">Schedule</a><a href="#specs">Spec sections</a><a href="#generic">Generic CSV</a><a href="#rules">How it calculates</a><a href="#data">Your data</a>
      </nav>

      <h2 id="acc">Autodesk Build (Autodesk Construction Cloud)</h2>
      <h3>RFI log</h3>
      <ol>
        <li>Open the project and go to <b>RFIs</b> in the left navigation.</li>
        <li>Clear the filters if you want the whole log. Closed RFIs are needed for turnaround and scorecards.</li>
        <li>Click <b>Export</b>, give the report a title, choose <b>Excel</b> as the file format, and click <b>Run Report</b>. Download the file when it is ready.</li>
        <li>Drop the .xlsx here. A title block above the header row is skipped automatically.</li>
      </ol>
      <p>Autodesk&rsquo;s help documents the export steps but not the exact column headers, so matching is by name. The columns used, in the names the RFI log shows: <code>ID</code> or <code>Number</code>, <code>Title</code>, <code>Status</code>, <code>Ball in court</code>, <code>Assigned to</code> or <code>Reviewers</code>, <code>Created on</code>, <code>Due date</code>, <code>Responded on</code>, <code>Closed on</code>, <code>Cost impact</code>, <code>Schedule impact</code>, <code>Location</code>. If yours differ, pick them in the mapping step.</p>
      <h3>Submittal log</h3>
      <ol>
        <li>Go to <b>Submittals</b>, open the <b>Items</b> tab, and export the log to Excel.</li>
        <li>Useful columns: <code>Spec section</code>, <code>Number</code>, <code>Revision</code>, <code>Title</code>, <code>Status</code>, <code>Ball in court</code>, <code>Manager</code>/<code>Reviewer</code>, <code>Submitted on</code>, <code>Due date</code>, <code>Returned on</code>, <code>Required on job date</code>, <code>Lead time</code>.</li>
        <li>If you track required-on-job dates and lead times in Build, submit-by dates work even without a schedule.</li>
      </ol>

      <h2 id="procore">Procore</h2>
      <h3>RFIs</h3>
      <ol>
        <li>Open the project&rsquo;s <b>RFIs</b> tool. Optionally set filters; the export follows them.</li>
        <li>Click <b>Export &rsaquo; CSV</b>.</li>
      </ol>
      <p>Procore documents the CSV columns as: <code>#</code>, <code>Created By</code>, <code>Initiated At</code>, <code>RFI Manager</code>, <code>Assigned</code>, <code>Due Date</code>, <code>Subject</code>, <code>Responsible Contractor</code>, <code>Received From</code>, <code>Cost Impact</code>, <code>Cost Impact Value</code>, <code>Schedule Impact</code>, <code>Schedule Impact Value</code>, <code>Drawing Number</code>, <code>Reference</code>, <code>Closed Date</code>, <code>Cost Code</code>, <code>Location</code>, <code>Closed?</code>, <code>Ball In Court</code>, <code>Latest Assignee Response Date</code>, <code>Private</code>. All are recognised; <code>Latest Assignee Response Date</code> is used as the response date. People shown with their company, <code>Dana Ortiz (Kessler Ray Architects)</code>, count against the company, since review periods are per firm; <code>Ortiz, Dana</code> stays one person.</p>
      <h3>Submittals</h3>
      <ol>
        <li>Open <b>Submittals</b>, choose the Items list, then <b>Export &rsaquo; CSV</b>.</li>
        <li>Procore lists each revision as its own row. They are combined into one item per number, keeping the latest revision and counting revisions as resubmittal loops.</li>
      </ol>

      <h2 id="history">Status history (optional, better accuracy)</h2>
      <p>Neither log export includes the full hand-off history, so by default time is split using the dates on each item: GC until it is sent, reviewer until it is answered, GC until it is closed. If you have a history (from the item&rsquo;s activity log, a Procore change-history report, or your own tracker), import a CSV with one row per change:</p>
      <Code label="CSV" code={'Number,Type,Changed on,Ball in court,Status\n14,RFI,2026-10-01,Halvorsen Builders,Draft\n14,RFI,2026-10-02,Kessler Ray Architects,Open\n14,RFI,2026-10-09,Brandt Structural Engineers,Open\n14,RFI,2026-10-16,Kessler Ray Architects,Open\n14,RFI,2026-10-21,Halvorsen Builders,Answered'} />
      <p>Import the log first, then the history. Rows are matched by number (and type, if given). The Data tab has a downloadable template.</p>

      <h2 id="schedule">Schedule (optional)</h2>
      <h3>Primavera P6</h3>
      <p>Drop the <code>.xer</code> file as exported (<b>File &rsaquo; Export &rsaquo; Primavera PM (XER)</b>). The <code>TASK</code> table is read directly; baseline copies of the project (rows whose project has an <code>orig_proj_id</code>), level-of-effort and WBS summary activities are skipped. Start and finish are the actual dates where the activity has them, else the early (forecast) dates, else the planned ones. <code>total_float_hr_cnt</code> is converted to days with each activity&rsquo;s own calendar hours per day (a 10-hour calendar turns 80 hours into 8 days), and an activity is critical when its total float is zero or less or it is on the longest path. Windows-1252 text (what P6 writes) is decoded correctly. A spreadsheet export of the Activities table also works: <code>task_code</code>, <code>task_name</code>, <code>target_start_date</code> or <code>early_start</code>, <code>Total Float</code> (days) and dates like <code>14-Dec-26 A</code> are recognised.</p>
      <h3>Microsoft Project</h3>
      <p><b>File &rsaquo; Save As &rsaquo; CSV</b>, and in the export wizard create a map for Tasks with <code>ID</code>, <code>Name</code>, <code>Start</code>, <code>Finish</code>, <code>Total Slack</code>, <code>Critical</code>. Dates like <code>Mon 12/14/26</code> are fine.</p>
      <h3>How items link to activities</h3>
      <ol>
        <li>A manual link you choose on the Schedule tab.</li>
        <li>An activity ID column in the log (<code>Activity ID</code>, <code>Schedule activity</code>).</li>
        <li>The item&rsquo;s spec section appearing in the activity name or ID, e.g. <code>Curtain wall install (08 44 13)</code>. The earliest matching activity wins.</li>
      </ol>

      <h2 id="specs">Spec section list (optional)</h2>
      <p>A two-column CSV, <code>Section,Title</code>, adds section titles to the submittal register. Copy it from the project manual table of contents.</p>

      <h2 id="generic">Generic CSV</h2>
      <p>Any spreadsheet with at least a number, a title and a created date works. Add a <code>Type</code> column (RFI or Submittal) or choose it during import. Dates can be ISO (<code>2026-11-03</code>), US (<code>11/3/2026</code>), day-first (<code>13/11/2026</code>, used for the whole file when a date only makes sense that way, as in UK, Canadian and Australian exports), <code>Nov 3, 2026</code>, <code>03-Nov-26</code> or Excel serial numbers. Bad rows are listed with their line numbers and skipped; everything else imports.</p>

      <h2 id="rules">How it calculates</h2>
      <ul>
        <li><b>Working days.</b> Monday to Friday, minus the project&rsquo;s holiday list. The default list is the usual US commercial construction set: New Year&rsquo;s Day, Memorial Day, Independence Day, Labor Day, Thanksgiving and the day after, Christmas, each moved to the nearest weekday when it falls on a weekend. Edit it per project, or load official public holidays for a country or region (for example <code>GB-ENG</code>, <code>CA-ON</code>, <code>AU-NSW</code>) from the free <a href="https://date.nager.at" target="_blank" rel="noreferrer">Nager.Date</a> API (nationwide holidays plus those for the region, fetched live when you click Load).</li>
        <li><b>Aging.</b> Working days after the created date up to today (or the close date). An item created and answered the same day has age 0.</li>
        <li><b>Ball in court.</b> Each hand-off starts a new stretch with that firm. Firms get a role (Architect, Engineer, Owner, Subcontractor, GC) guessed from the name; fix any guess on the Parties tab.</li>
        <li><b>Overdue.</b> A reviewer stretch is overdue when it runs past its contractual due date: the item&rsquo;s exported due date if there is one, else the start of the stretch plus the party&rsquo;s review period. Defaults are 10 working days for the architect and engineers, 5 for the owner (typical of Section 01 33 00 submittal procedures and RFI clauses); set yours from the contract.</li>
        <li><b>Submit by.</b> Required on site (from the log, else the linked activity&rsquo;s start) minus lead time in calendar days, minus review cycles &times; the reviewer&rsquo;s period in working days. Two cycles are assumed (one resubmittal); each revision already made uses up one.</li>
        <li><b>Float.</b> Not yet submitted: working days until submit-by. In review: assumes it comes back on its due date (or tomorrow if already late), then any remaining cycles, then lead time; float is working days from that forecast to the need date. RFIs: forecast answer vs the linked activity&rsquo;s start.</li>
        <li><b>Critical path threats.</b> &ldquo;Delays completion&rdquo; when the item&rsquo;s negative float is larger than the activity&rsquo;s own total float. &ldquo;At risk&rdquo; when the activity is critical and float is under the threshold (10 working days by default), or float is negative.</li>
        <li><b>Scorecards.</b> Median and 90th percentile turnaround over returned reviews; percent late over returned reviews plus open reviews already past due, so a firm cannot look good by not answering.</li>
        <li><b>Burn-down.</b> Average opened and closed per week over the last 8 weeks, projected in a straight line.</li>
        <li><b>Impact flags.</b> &ldquo;Yes&rdquo;, &ldquo;TBD&rdquo; and &ldquo;Unknown&rdquo; count as a potential impact; &ldquo;No&rdquo; and &ldquo;N/A&rdquo; do not.</li>
      </ul>
      <p>The delay-notice evidence log is a factual list of dates. It is not legal advice; check your contract&rsquo;s notice provisions and time limits.</p>

      <h2 id="data">Your data</h2>
      <p>Projects live in your browser&rsquo;s IndexedDB. Signing in (optional, email and password) syncs projects, firm roles, review periods, links and weekly snapshots, and logs up to 1.5 MB per project. Larger logs stay on the device that imported them. You can export everything as JSON, delete your cloud data, or delete your account from the account menu. <Link href="/settings">Settings</Link></p>
    </section>
  )
}
