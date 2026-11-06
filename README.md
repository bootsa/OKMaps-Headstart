# Head Start

Head Start is a web-based knowledge mapping software intended to give anyone a head start on their literature search (hence the name). It makes knowledge maps from a variety of data sources, in the browser.

![Head Start](headstart.png)

## How it is built

Maps are made in the browser. A search goes straight to the provider (or
through a small gateway where the provider needs one), the map is computed
in a Web Worker, and the person's maps are kept where they choose: in the
browser, a WebDAV folder, a Solid Pod or an Atomic Data server. It works
offline once installed as a web app.

| Folder | What |
|---|---|
| `packages/app` | the browser app (Vite): search, map list, storage choice, share links, offline |
| `packages/pipeline` | turns records into a map: clustering, layout, area titles (a TypeScript port of the R scripts) |
| `packages/sources` | the providers: PubMed, BASE, OpenAIRE, Crossref citation counts |
| `packages/storage` | where maps are kept: one interface, an adaptor per storage system |
| `packages/gateway` | the small server some providers need (BASE's registered IP and key) and the store for share links |
| `vis/` | the map visualisation (webpack; the app builds and loads it) |
| `legacy/` | the old R and Python code, kept only to regenerate test goldens and run the parity checks |

Each package has a README with how to run and test it. To run the app:

    cp config.example.js config.js && npm ci
    cd packages/app && npm ci && npm run build:vis && npm run dev

The app is published to GitHub Pages by `.github/workflows/pages.yml`.

The earlier server (PHP, R and Python workers, Postgres, Redis, Docker
setup) is on the [`legacy-server`](https://github.com/bootsa/OKMaps-Headstart/tree/legacy-server) branch.

### Visualisation tests

    npm ci && npm test

## Contributors

Maintainer: [Christopher Kittel](https://github.com/chreman) ([christopher.kittel@openknowledgemaps.org](mailto:christopher.kittel@openknowledgemaps.org)), [Maxi Schramm](https://github.com/tanteuschi) ([maxi@openknowledgemaps.org](mailto:maxi@openknowledgemaps.org)), and [Peter Kraker](https://github.com/pkraker) ([pkraker@openknowledgemaps.org](mailto:pkraker@openknowledgemaps.org))

Authors: [Thomas Arrow](https://github.com/tarrow), [Andrei Shket](https://github.com/andreishket), [Sergey Krutilin](https://github.com/modsen-hedgehog), [Alexandra Shubenko](https://github.com/vrednyydragon), [Jan Konstant](https://github.com/konstiman), [Asura Enkhbayar](https://github.com/Bubblbu), [Scott Chamberlain](https://github.com/sckott), [Rainer Bachleitner](https://github.com/rbachleitner), [Yael Stein](https://github.com/jaels), [Mike Skaug](https://github.com/mikeskaug), [Philipp Weissensteiner](https://github.com/wpp), and the [Open Knowledge Maps team](http://openknowledgemaps.org/team)

## Showcases

* [Open Knowledge Maps Search](https://openknowledgemaps.org/): Creates a visualisation on the fly based on a user's search in either BASE or PubMed.
* [OKMaps Custom Services](https://openknowledgemaps.org/custom): Enable third parties to embed customisable search components and visualisations.
* [VisConnect](https://openknowledgemaps.org/visconnect): Provides an interactive visual profile of a researcher’s work.

## Browser compatibility

The frontend has been successfully tested with Chrome, Firefox, Safari and Microsoft Edge. Unfortunately, Internet Explorer is not supported due to the fact that it is not possible to insert HTML into a foreignObject.

## Background

More information can be found in the following papers:

Kraker, P., Beardmore, L., Hemila, M., Johann, D., Kaczmirek, L. & Schubert, C. (2024). [Partizipative Modelle im Zusammenspiel von Bibliotheken und KI-Systemen: Drei Fallstudien zur Integration der visuellen Recherche-Plattform Open Knowledge Maps](https://www.b-i-t-online.de/heft/2024-04-fachbeitrag-kraker.pdf). B.I.T. Online,  27(4), 327-335.

Kraker, P., Goyal, G., Schramm, M., Akin, J., & Kittel, C. (2021). [CoVis: A curated, collaborative & visual knowledge base for COVID-19 research](https://doi.org/10.5281/zenodo.4586079). Zenodo. doi: 10.5281/zenodo.4586079

Kraker, P., Schramm, M., Kittel, C., Chamberlain, S., & Arrow, T. (2018). [VIPER: The Visual Project Explorer](https://zenodo.org/record/1248119). Zenodo. doi:10.5281/zenodo.2587129

Kraker, P., Kittel, C., & Enkhbayar, A. (2016). [Open Knowledge Maps: Creating a Visual Interface to the World’s Scientific Knowledge Based on Natural Language Processing](https://doi.org/10.12685/027.7-4-2-157). 027.7 Journal for Library Culture, 4(2), 98–103. doi:10.12685/027.7-4-2-157

Kraker, P., Schlögl, C. , Jack, K. & Lindstaedt, S. (2015). [Visualization of Co-Readership Patterns from an Online Reference Management System](http://arxiv.org/abs/1409.0348). Journal of Informetrics, 9(1), 169–182. doi:10.1016/j.joi.2014.12.003

Kraker, P., Körner, C., Jack, K., & Granitzer, M. (2012). [Harnessing User Library Statistics for Research Evaluation and Knowledge Domain Visualization](http://know-center.tugraz.at/download_extern/papers/user_library_statistics.pdf). Proceedings of the 21st International Conference Companion on World Wide Web (pp. 1017–1024). Lyon: ACM. doi:10.1145/2187980.2188236


## License
Head Start is licensed under [MIT](LICENSE).

## Funding
<img src="https://raw.githubusercontent.com/OpenKnowledgeMaps/CoVis/master/img/EU-flag_small-270x183.png" width="60"> 

This project has received funding from the European Union's Horizon 2020 and Horizon Europe research and innovation programmes, under grant agreement nos. 831644, 863420, and 101129751.
