# Investigator tools

Elasticsearch-based log search and wiki application. Pairs well with the [node-log-forwarder](https://github.com/fluggo/node-log-forwarder).

This toolset is meant for use by a team for monitoring log activity and changes to inventory, personnel, or other items of interest. The wiki connects to outside sources both to track changes in data as well as to help align multiple data sources, such as Active Directory and a remote agent management system.

As of right now, it has good support for:

* Wiki articles written in [Textile](http://redcloth.org/hobix.com/textile/) which can be tagged for categorization and which show all forward- and back-links with context, and which are optionally separated into reviewed-and-vetted versions and unreviewed versions for maximum accuracy.
* Collecting and searching through complete LDAP dumps. Find any item in seconds. Follow group membership forward and backwards across domains.
* Windows event logs as collected with [node-log-forwarder](https://github.com/fluggo/node-log-forwarder) and [NXLog](https://nxlog.co/).
* Detailed SQL Server logs, syslog, Netflow, Bunyan logs, and even event logs from the hosted [CylancePROTECT](https://www.cylance.com/en_us/products/our-products/protect.html) malware protection solution

Much more can be done to generalize this project and make it applicable to more organizations:

* Log sources can be modularized so new ones can be created and added with ease.
* Likewise with wiki data sources.
* Incident management could be added with support for live collaboration between team members.

# Contact, acknowledgements

Written by Brian Crowell, with special thanks to the organization that supported this project, who has asked to remain anonymous.

This project includes source code from [textile.js](https://github.com/borgar/textile-js) by Borgar Þorsteinsson and [node-windows-sid](https://github.com/0x7f/node-windows-sid/) by Maximilian Haupt.

I consider this an active project, one which I am very happy to return to. If you have an interest or need, please contact me.
